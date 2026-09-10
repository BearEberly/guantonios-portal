import { handleOperation } from './_shared.js';
export const onRequestPost = ({ request, env }) => handleOperation(request, env, 'change');
