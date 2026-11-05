function polymorfaError(status, headers, body) {

try { iml.polymorfaResult(status, headers, body); return 'Polymorfa invalid_response'; } catch (error) { return error.message; }
}
