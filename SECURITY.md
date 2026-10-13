# Security Policy

## Reporting a vulnerability

Please report security issues privately by email to **certidevelopment@gmail.com** with the subject
"AngebotPilot security". Do not open public issues and do not test against other customers' data.

Include where possible:
- affected component (API, web app, mobile app, customer page) and URL/endpoint,
- steps to reproduce or a proof of concept,
- impact as you understand it,
- whether you want to be credited.

What to expect:
- acknowledgement within 5 working days,
- an assessment and planned fix timeline after triage,
- notification when the issue is fixed.

There is currently no bug-bounty programme. Please act in good faith: no denial-of-service testing, no social
engineering, no access to data that is not yours, and delete any data you obtained after reporting.

## Supported versions

| Component | Supported |
|---|---|
| API – currently deployed version at `https://angebotpilot.runasp.net` | ✔ |
| Web app – currently deployed version at `https://metur100.github.io/Angebot.Pilot.App/` | ✔ |
| Mobile apps – latest version published in the stores (none published yet) | ✔ |
| Older mobile app versions | best effort; users are asked to update |
| Development builds, forks, self-hosted copies | ✘ |

## Security documentation

- [docs/security/THREAT-MODEL.md](docs/security/THREAT-MODEL.md) – threats, mitigations, residual risks, open findings
- [docs/security/SECURITY-CHECKLIST.md](docs/security/SECURITY-CHECKLIST.md) – pre-launch checklist
