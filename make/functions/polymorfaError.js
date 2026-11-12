function polymorfaError(status, headers, body, method) {

try { iml.polymorfaResult(status, headers, body, method); return 'Polymorfa invalid_response'; } catch (error) { return error.message; }
}
