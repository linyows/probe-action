Probe Action
==

A GitHub Action that runs [probe](https://github.com/linyows/probe) workflows for testing, monitoring, and automation tasks.

Features
--

- **Easy Integration**: Simple setup with your existing GitHub workflows
- **Automatic Download**: Automatically downloads and sets up the probe binary
- **Linux Support**: Runs on Ubuntu runners (x86_64 and ARM64)
- **Flexible Options**: Configurable verbose output and response time display
- **Rich Testing**: Supports HTTP, SSH, Database, Browser, Shell, SMTP, and IMAP actions
- **Rate Limit Safe**: Uses GitHub token for API calls to avoid rate limiting

Usage
--


```yaml
name: API Testing
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run probe tests
        uses: linyows/probe-action@main
        with:
          path: 'tests/api-test.yml'
```

Inputs
--

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `path` | Path to the probe workflow YAML file | Yes | - |
| `version` | Version of probe to use | - | `latest` |
| `verbose` | Enable verbose output (true/false/yes/1) | - | `false` |
| `response-time` | Show response times (true/false/yes/1) | - | `false` |
| `action-debug` | Enable action debug output (true/false/yes/1) | - | `false` |

Sample Probe Workflow
--

Create a probe workflow file (e.g., `tests/api-test.yml`):

```yaml
name: API Health Check
description: Test API endpoints

jobs:
  - name: API Tests
    steps:
      - name: Test API Health
        uses: http
        with:
          get: https://api.example.com/health
        test: "res.code == 200"

      - name: Test API Authentication
        uses: http
        with:
          post: https://api.example.com/auth
          json:
            username: "test"
            password: "secret"
        test: "res.code == 200 && res.body.token != ''"
```

Supported Probe Actions
--

The probe tool supports various built-in actions:

- **HTTP**: REST API testing, authentication, file uploads
- **GRPC**: GRPC testing, authentication
- **Database**: SQL queries and connection testing
- **Shell**: Command execution and script running
- **SSH**: Remote command execution and file operations
- **SMTP**: Email sending functionality
- **IMAP**: Email reading and processing
- **Embedded**: Embedded job execution
- **Browser**: Web UI automation and testing

For detailed probe syntax and examples, see the [probe documentation](https://github.com/linyows/probe).

Platform Support
--

Currently only Linux is supported.

- **Linux** (ubuntu-latest): x86_64, ARM64

Debugging
--

Enable verbose output and response times for detailed information:

```yaml
- uses: linyows/probe-action@main
  with:
    path: 'tests/debug-test.yml'
    verbose: 'true'
    action-debug: 'true'  # Shows action internal debug information
```

Contributing
--

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

License
--

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
