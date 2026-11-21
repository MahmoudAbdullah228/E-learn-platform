# S3-19 local security, privacy and performance review

## Findings and verification

| Area | Local evidence |
| --- | --- |
| Dependencies | The backend production audit flagged body-parser, ip-address, mongoose, nodemailer, qs and zod (three high and three moderate package findings). The compatible lockfile update was installed with lifecycle scripts disabled. The subsequent backend audit including development dependencies reported zero known vulnerabilities. Recheck at release with `npm audit`. |
| Access logs | HTTP logs retain request ID, method, response status and elapsed time. Request paths, query strings, client addresses and response headers are omitted. Pino's HTTP error serializer uses the backend's sanitized error metadata. The foundation HTTP suite inspects emitted JSON with synthetic sensitive markers. |
| Secret handling | A filename-only pattern scan of tracked and unignored source/configuration/document text found no matching private-key header, credentialed Cloudinary URL, or selected Stripe, AWS and GitHub key formats. No tracked .env, .key or .pem file was listed. This check covers the current tree. Previously shared provider keys remain under credential-owner action O07. |
| Order query | An unfiltered admin order page examined all 800 synthetic rows for 20 results. A descending compound index on createdAt and _id now supports its stable sort. The order query plan suite measures the admin and student first-page reads separately in a disposable test collection. It does not benchmark total count, offset pages, joins or HTTP latency. |
| Access and privacy regressions | The verification suite includes authentication and refresh rotation, password reset, owner-scoped media and library reads, protected finance operations, private response caching, malformed input, body-size limits, and credentialed CORS. See the [staging matrix](sprint_3_staging_matrix.md) for corresponding deployed cases. |

## Release evidence still required

Local results on 2026-11-21: `npm run verify` passed lint, OpenAPI validation and
668 tests with zero skips. Both order reads examined 20 keys and 20 documents
for 20 results. The local frontend built successfully. An exact-value comparison
of nine configured backend secret values against its three emitted HTML, JS and
CSS artifacts found zero matches.

BE1 and the deployment operator should capture index readiness, plans on the deployment dataset, route latency and error rates against an agreed workload and SLO (O03). FE reviewers should exercise secure-cookie refresh, logout and credentialed cross-origin requests through the actual HTTPS frontend. Check rate limits across the deployed instances, inspect sanitized ingress logs and scan the integrated frontend artifact for the release build. Record build IDs and evidence under B20. Product acceptance and qualified review remain open. [Decision owners](sprint_3_policy_register.md)
