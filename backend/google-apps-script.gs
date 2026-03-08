const SHEET_NAME = "Form_Responses";

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: "public-signup" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};

    const firstName = (params.firstName || "").trim();
    const lastName = (params.lastName || "").trim();
    const phoneNumber = (params.phoneNumber || "").trim();

    if (!firstName || !lastName || !phoneNumber) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Missing required fields" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
      || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);

    sheet.appendRow([new Date(), firstName, lastName, phoneNumber]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
