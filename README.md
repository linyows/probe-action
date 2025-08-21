# Probe Action

A GitHub Action that runs [probe](https://github.com/linyows/probe) workflows for testing, monitoring, and automation tasks.

## Features

- 🚀 **Easy Integration**: Simple setup with your existing GitHub workflows
- 🔄 **Automatic Download**: Automatically downloads and sets up the probe binary
- 🐧 **Linux Support**: Runs on Ubuntu runners (x86_64 and ARM64)
- 🎛️ **Flexible Options**: Configurable verbose output and response time display
- 📊 **Rich Testing**: Supports HTTP, SSH, Database, Browser, Shell, SMTP, and IMAP actions

## Usage

### Basic Example

```yaml
name: API Testing
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run probe tests
        uses: linyows/probe-action@v1
        with:
          workflow-path: 'tests/api-test.yml'
```

### Advanced Example

```yaml
name: Comprehensive Testing
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run probe with all options
        uses: linyows/probe-action@v1
        with:
          workflow-path: 'tests/comprehensive-test.yml'
          probe-version: 'v0.20.1'
          verbose: 'true'
          response-time: 'true'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `workflow-path` | Path to the probe workflow YAML file | ✅ Yes | - |
| `probe-version` | Version of probe to use | ❌ No | `latest` |
| `verbose` | Enable verbose output | ❌ No | `false` |
| `response-time` | Show response times | ❌ No | `false` |

## Sample Probe Workflow

Create a probe workflow file (e.g., `tests/api-test.yml`):

```yaml
name: API Health Check
description: Test API endpoints and database connectivity

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
      
      - name: Test Database Connection
        uses: shell
        with:
          run: |
            curl -f https://api.example.com/db-status
        test: "status == 0"
```

## Supported Probe Actions

The probe tool supports various built-in actions:

- **HTTP**: REST API testing, authentication, file uploads
- **SSH**: Remote command execution and file operations  
- **Database**: SQL queries and connection testing
- **Browser**: Web UI automation and testing
- **Shell**: Command execution and script running
- **SMTP**: Email sending functionality
- **IMAP**: Email reading and processing

For detailed probe syntax and examples, see the [probe documentation](https://github.com/linyows/probe).

## Platform Support

- ✅ **Linux** (ubuntu-latest): x86_64, ARM64
- ❌ **macOS**: Not currently supported
- ❌ **Windows**: Not currently supported

## Version Compatibility

- **probe**: v0.20.1 (latest)
- **GitHub Actions**: All supported runner versions
- **Node.js**: Not required (composite action)

## Examples

### HTTP API Testing

```yaml
# tests/http-test.yml
name: HTTP Tests
jobs:
  - name: API Endpoints
    steps:
      - name: Get Users
        uses: http
        with:
          get: https://jsonplaceholder.typicode.com/users
        test: "res.code == 200 && len(res.body) > 0"
      
      - name: Create Post
        uses: http
        with:
          post: https://jsonplaceholder.typicode.com/posts
          json:
            title: "Test Post"
            body: "This is a test"
            userId: 1
        test: "res.code == 201"
```

### Multi-Step Workflow

```yaml
# tests/multi-step.yml
name: Multi-Step Test
jobs:
  - name: Setup and Test
    steps:
      - name: Health Check
        uses: http
        with:
          get: https://api.example.com/health
        test: "res.code == 200"
        
      - name: Get Auth Token
        uses: http
        with:
          post: https://api.example.com/login
          json:
            username: "${{ vars.TEST_USERNAME }}"
            password: "${{ vars.TEST_PASSWORD }}"
        test: "res.code == 200"
        outputs:
          token: "res.body.access_token"
      
      - name: Use Token
        uses: http
        with:
          get: https://api.example.com/protected
          headers:
            Authorization: "Bearer {{ outputs.token }}"
        test: "res.code == 200"
```

## Troubleshooting

### Common Issues

1. **Workflow file not found**
   ```
   Error: Workflow file not found: tests/my-test.yml
   ```
   - Ensure the workflow file exists in your repository
   - Check the path is relative to the repository root

2. **Probe test failures**
   ```
   ✘ 1 job(s) failed
   ```
   - Use `verbose: 'true'` to see detailed output
   - Check your test conditions and API endpoints

3. **Permission issues**
   ```
   Permission denied
   ```
   - Ensure your runner has network access to target endpoints
   - Check if endpoints require authentication

### Debugging

Enable verbose output and response times for detailed information:

```yaml
- uses: linyows/probe-action@v1
  with:
    workflow-path: 'tests/debug-test.yml'
    verbose: 'true'
    response-time: 'true'
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Related Projects

- [probe](https://github.com/linyows/probe) - The underlying automation tool
- [GitHub Actions](https://github.com/features/actions) - CI/CD platform

---

Made with ❤️ for the GitHub Actions community