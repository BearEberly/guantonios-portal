import { handleOperatorStatus } from '../_shared.js';
export const onRequestPost = ({ request, env }) => handleOperatorStatus(request, env);
