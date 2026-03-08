import {
  corsHeaders,
  json,
  parseJson,
  readEnv,
  requireAdminSession,
  normalizeIsoDate,
  normalizeString,
  roundCurrency,
  getActiveSquareConnection,
  updateSquareConnectionById,
  tokenExpiresSoon,
  refreshSquareAccessToken
} from "./_shared.js";

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(context.request, "POST, OPTIONS") });
  }

  if (context.request.method !== "POST") {
    return json(context.request, { ok: false, error: "Method not allowed" }, 405, "POST, OPTIONS");
  }

  return onRequestPost(context);
}

export async function onRequestPost(context) {
  try {
    const env = readEnv(context, { requireOAuthCredentials: false });

    const adminSession = await requireAdminSession(context.request, env);
    if (!adminSession.ok) {
      return json(context.request, { ok: false, error: adminSession.error }, adminSession.status || 401, "POST, OPTIONS");
    }

    const body = await parseJson(context.request);
    const dateIso = normalizeIsoDate(body.date);
    if (!dateIso) {
      return json(context.request, { ok: false, error: "Valid date is required (YYYY-MM-DD)" }, 400, "POST, OPTIONS");
    }

    const requestedLocationId = normalizeString(body.locationId, 80);
    const requestedLocationName = normalizeString(body.locationName, 80);
    const range = dateRangeForBusinessDay(dateIso, env.squareBusinessTimeZone);

    const connectionResult = await getActiveSquareConnection(env);
    if (!connectionResult.ok) {
      return json(context.request, { ok: false, error: connectionResult.error }, connectionResult.status || 500, "POST, OPTIONS");
    }

    const connection = connectionResult.connection;
    let source = "none";
    let accessToken = "";
    let connectionId = "";
    let connectionLocationId = "";

    if (connection && connection.access_token) {
      source = "oauth";
      accessToken = String(connection.access_token || "");
      connectionId = String(connection.id || "");
      connectionLocationId = String(connection.location_id || "");

      if (
        tokenExpiresSoon(connection.expires_at)
        && connection.refresh_token
        && env.squareOauthClientId
        && env.squareOauthClientSecret
      ) {
        const refreshed = await refreshSquareAccessToken(env, String(connection.refresh_token || ""));
        if (refreshed.ok && refreshed.token && refreshed.token.access_token) {
          accessToken = String(refreshed.token.access_token || "");
          const refreshPatch = {
            access_token: accessToken,
            refresh_token: String(refreshed.token.refresh_token || connection.refresh_token || ""),
            expires_at: String(refreshed.token.expires_at || connection.expires_at || ""),
            scope: normalizeScope(refreshed.token.scopes),
            updated_at: new Date().toISOString()
          };
          await updateSquareConnectionById(env, connectionId, refreshPatch);
        }
      }
    } else if (env.squareAccessToken) {
      source = "env";
      accessToken = env.squareAccessToken;
    }

    if (!accessToken) {
      return json(
        context.request,
        { ok: false, error: "Square is not connected. Connect Square on Admin > Integrations first." },
        400,
        "POST, OPTIONS"
      );
    }

    const resolvedLocationId = requestedLocationId || connectionLocationId || env.squareLocationId || "";

    const sync = await fetchSquareTips({
      baseUrl: env.squareBaseUrl,
      squareAccessToken: accessToken,
      locationId: resolvedLocationId,
      beginTimeIso: range.start.toISOString(),
      endTimeIso: range.end.toISOString()
    });

    if (!sync.ok) {
      return json(context.request, { ok: false, error: sync.error }, sync.status || 502, "POST, OPTIONS");
    }

    let orderMetrics = {
      ok: true,
      totalDiscountCents: 0,
      serviceChargeCents: 0,
      autoGratuityCents: 0,
      orderCount: 0,
      warning: ""
    };

    if (sync.orderIds.length) {
      const ordersResult = await fetchSquareOrderMetrics({
        baseUrl: env.squareBaseUrl,
        squareAccessToken: accessToken,
        locationId: resolvedLocationId,
        orderIds: sync.orderIds
      });

      if (ordersResult.ok) {
        orderMetrics = ordersResult;
      } else {
        orderMetrics.warning = ordersResult.error || "Order-level metrics unavailable for this sync.";
      }
    }

    const squareTipsAmount = roundCurrency(sync.totalTipCents / 100);
    const grossSalesAmount = roundCurrency(sync.totalCollectedCents / 100);
    const cashSalesAmount = roundCurrency(sync.cashCollectedCents / 100);
    const cardSalesAmount = roundCurrency(sync.cardCollectedCents / 100);
    const refundAmount = roundCurrency(sync.totalRefundCents / 100);
    const discountAmount = roundCurrency(orderMetrics.totalDiscountCents / 100);
    const autoGratuityAmount = roundCurrency(orderMetrics.autoGratuityCents / 100);
    const netSalesAmount = roundCurrency((sync.totalCollectedCents - sync.totalRefundCents) / 100);

    const suggestedInputs = {
      square_tips: squareTipsAmount,
      large_party_tips: autoGratuityAmount,
      cash_on_hand: cashSalesAmount,
      cash_due: null
    };

    if (source === "oauth" && connectionId) {
      await updateSquareConnectionById(env, connectionId, {
        last_sync_at: new Date().toISOString(),
        last_sync_date: dateIso,
        last_sync_tip_amount: squareTipsAmount,
        location_id: resolvedLocationId || null,
        location_name: requestedLocationName || String(connection.location_name || "") || null,
        updated_at: new Date().toISOString()
      });
    }

    return json(context.request, {
      ok: true,
      provider: "square",
      source,
      date: dateIso,
      timezone: env.squareBusinessTimeZone,
      location_id: resolvedLocationId || null,
      payment_count: sync.paymentCount,
      order_count: orderMetrics.orderCount,
      currency: sync.currency || "USD",
      square_tips: squareTipsAmount,
      large_party_tips: autoGratuityAmount,
      gross_sales: grossSalesAmount,
      net_sales: netSalesAmount,
      card_sales: cardSalesAmount,
      cash_sales: cashSalesAmount,
      refunds: refundAmount,
      discounts: discountAmount,
      suggested_inputs: suggestedInputs,
      warning: orderMetrics.warning || null,
      window_start: range.start.toISOString(),
      window_end: range.end.toISOString()
    }, 200, "POST, OPTIONS");
  } catch (error) {
    return json(context.request, { ok: false, error: String(error) }, 500, "POST, OPTIONS");
  }
}

function normalizeScope(scopes) {
  if (Array.isArray(scopes)) {
    return scopes.map(function mapScope(scope) {
      return String(scope || "").trim();
    }).filter(Boolean).join(" ");
  }
  return String(scopes || "").trim();
}

function addDaysIso(isoDate, dayCount) {
  const base = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    return isoDate;
  }
  base.setUTCDate(base.getUTCDate() + dayCount);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

function getFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function partsFromDate(date, timeZone) {
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const output = {};
  parts.forEach(function mapPart(part) {
    if (part.type === "year" || part.type === "month" || part.type === "day" || part.type === "hour" || part.type === "minute" || part.type === "second") {
      output[part.type] = Number(part.value);
    }
  });
  return output;
}

function zonedDateTimeToUtcDate(input, timeZone) {
  const year = Number(input.year);
  const month = Number(input.month);
  const day = Number(input.day);
  const hour = Number(input.hour || 0);
  const minute = Number(input.minute || 0);
  const second = Number(input.second || 0);
  const millisecond = Number(input.millisecond || 0);

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const guessDate = new Date(utcGuess);
  const localParts = partsFromDate(guessDate, timeZone);

  const localAsUtc = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second,
    0
  );

  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const offsetMs = localAsUtc - utcGuess;
  const correctedUtc = desiredAsUtc - offsetMs;

  return new Date(correctedUtc + millisecond);
}

function dateRangeForBusinessDay(dateIso, timeZone) {
  const [year, month, day] = dateIso.split("-").map(function toNumber(part) {
    return Number(part);
  });
  const nextDateIso = addDaysIso(dateIso, 1);
  const [nextYear, nextMonth, nextDay] = nextDateIso.split("-").map(function toNumber(part) {
    return Number(part);
  });

  const start = zonedDateTimeToUtcDate(
    { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timeZone
  );

  const nextStart = zonedDateTimeToUtcDate(
    { year: nextYear, month: nextMonth, day: nextDay, hour: 0, minute: 0, second: 0, millisecond: 0 },
    timeZone
  );

  const end = new Date(nextStart.getTime() - 1);
  return { start, end };
}

async function fetchSquareTips(input) {
  let cursor = "";
  let totalTipCents = 0;
  let totalCollectedCents = 0;
  let cashCollectedCents = 0;
  let cardCollectedCents = 0;
  let totalRefundCents = 0;
  let paymentCount = 0;
  let currency = "";
  const orderIds = new Set();

  for (;;) {
    const url = new URL("/v2/payments", input.baseUrl);
    url.searchParams.set("begin_time", input.beginTimeIso);
    url.searchParams.set("end_time", input.endTimeIso);
    url.searchParams.set("sort_order", "ASC");
    url.searchParams.set("limit", "100");
    if (input.locationId) {
      url.searchParams.set("location_id", input.locationId);
    }
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.squareAccessToken}`,
        "square-version": "2026-01-22"
      }
    });

    const payload = await response.json().catch(function fallbackJson() {
      return null;
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: extractSquareError(payload) || `Square API request failed (${response.status})`
      };
    }

    const payments = Array.isArray(payload && payload.payments) ? payload.payments : [];
    payments.forEach(function sumPayment(payment) {
      const status = String(payment && payment.status || "").toUpperCase();
      if (status && status !== "COMPLETED") {
        return;
      }

      paymentCount += 1;

      const tipAmount = Number(
        payment
        && payment.tip_money
        && typeof payment.tip_money.amount !== "undefined"
          ? payment.tip_money.amount
          : 0
      );

      if (Number.isFinite(tipAmount)) {
        totalTipCents += tipAmount;
      }

      const totalMoney = readMoneyAmount(payment && payment.total_money);
      const refundedMoney = readMoneyAmount(payment && payment.refunded_money);
      const sourceType = String(payment && payment.source_type || "").trim().toUpperCase();
      const orderId = String(payment && payment.order_id || "").trim();

      if (Number.isFinite(totalMoney)) {
        totalCollectedCents += totalMoney;
        if (sourceType === "CASH") {
          cashCollectedCents += totalMoney;
        } else {
          cardCollectedCents += totalMoney;
        }
      }

      if (Number.isFinite(refundedMoney)) {
        totalRefundCents += refundedMoney;
      }

      if (orderId) {
        orderIds.add(orderId);
      }

      if (!currency) {
        currency = String(
          payment
          && payment.tip_money
          && payment.tip_money.currency
            ? payment.tip_money.currency
            : payment && payment.total_money && payment.total_money.currency
              ? payment.total_money.currency
              : ""
        ).toUpperCase();
      }
    });

    cursor = payload && payload.cursor ? String(payload.cursor) : "";
    if (!cursor) {
      break;
    }
  }

  return {
    ok: true,
    totalTipCents,
    totalCollectedCents,
    cashCollectedCents,
    cardCollectedCents,
    totalRefundCents,
    paymentCount,
    currency: currency || "USD",
    orderIds: Array.from(orderIds)
  };
}

async function fetchSquareOrderMetrics(input) {
  const orderIds = Array.isArray(input.orderIds) ? input.orderIds.filter(Boolean) : [];
  if (!orderIds.length) {
    return {
      ok: true,
      totalDiscountCents: 0,
      serviceChargeCents: 0,
      autoGratuityCents: 0,
      orderCount: 0,
      warning: ""
    };
  }

  const totals = {
    totalDiscountCents: 0,
    serviceChargeCents: 0,
    autoGratuityCents: 0,
    orderCount: 0
  };

  const chunkSize = 100;
  for (let start = 0; start < orderIds.length; start += chunkSize) {
    const chunk = orderIds.slice(start, start + chunkSize);

    const body = {
      order_ids: chunk
    };
    if (input.locationId) {
      body.location_id = input.locationId;
    }

    const response = await fetch(new URL("/v2/orders/batch-retrieve", input.baseUrl).toString(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.squareAccessToken}`,
        "square-version": "2026-01-22",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(function fallbackJson() {
      return null;
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: extractSquareError(payload) || `Square orders request failed (${response.status})`
      };
    }

    const orders = Array.isArray(payload && payload.orders) ? payload.orders : [];
    orders.forEach(function inspectOrder(order) {
      totals.orderCount += 1;
      totals.totalDiscountCents += readMoneyAmount(order && order.total_discount_money);

      const serviceCharges = Array.isArray(order && order.service_charges) ? order.service_charges : [];
      if (serviceCharges.length) {
        serviceCharges.forEach(function inspectServiceCharge(serviceCharge) {
          const amount = readMoneyAmount(
            serviceCharge && (serviceCharge.total_money || serviceCharge.applied_money || serviceCharge.amount_money)
          );
          if (!amount) {
            return;
          }

          totals.serviceChargeCents += amount;

          const label = String(
            (serviceCharge && serviceCharge.name) || (serviceCharge && serviceCharge.calculation_phase) || ""
          ).toLowerCase();
          if (label.includes("gratuity") || label.includes("large") || label.includes("party")) {
            totals.autoGratuityCents += amount;
          }
        });
      } else {
        const fallbackServiceCharge = readMoneyAmount(order && order.total_service_charge_money);
        if (fallbackServiceCharge > 0) {
          totals.serviceChargeCents += fallbackServiceCharge;
          totals.autoGratuityCents += fallbackServiceCharge;
        }
      }
    });
  }

  if (!totals.autoGratuityCents && totals.serviceChargeCents > 0) {
    totals.autoGratuityCents = totals.serviceChargeCents;
  }

  return {
    ok: true,
    ...totals,
    warning: ""
  };
}

function readMoneyAmount(moneyObj) {
  if (!moneyObj || typeof moneyObj !== "object") {
    return 0;
  }
  const amount = Number(
    Object.prototype.hasOwnProperty.call(moneyObj, "amount")
      ? moneyObj.amount
      : 0
  );
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount);
}

function extractSquareError(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  if (Array.isArray(payload.errors) && payload.errors.length) {
    return payload.errors.map(function toMessage(errorItem) {
      return errorItem && (errorItem.detail || errorItem.code || errorItem.category) ? String(errorItem.detail || errorItem.code || errorItem.category) : "";
    }).filter(Boolean).join(" | ");
  }

  return String(payload.error || payload.message || "");
}
