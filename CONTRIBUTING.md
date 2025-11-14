# Contributing to Instant Paste

Thank you for your interest in contributing to Instant Paste! This document provides guidelines for contributing to the project.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/instant-paste.git
   cd instant-paste
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd client
   npm install
   cd ..
   ```

3. **Start development**
   
   In one terminal, start the backend:
   ```bash
   node server.js
   ```
   
   In another terminal, start the frontend dev server:
   ```bash
   cd client
   npm start
   ```
   
   The client will run on http://localhost:3001 and proxy API calls to the backend on port 3000.

## Project Structure

```
instant-paste/
├── server.js              # WebSocket + Express server
├── package.json           # Backend dependencies
├── client/                # React frontend
│   ├── src/
│   │   ├── App.tsx       # Main app component
│   │   ├── components/   # React components
│   │   ├── utils/        # Utility functions
│   │   └── types/        # TypeScript types
│   ├── public/           # Static assets
│   └── package.json      # Frontend dependencies
└── README.md             # Documentation
```

## Making Changes

1. **Create a branch** for your feature or bugfix
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** with clear, descriptive commits

3. **Test your changes** thoroughly
   - Test on different browsers
   - Test on mobile devices if possible
   - Ensure WebSocket connections work properly

4. **Build the client** before committing
   ```bash
   cd client
   npm run build
   ```

5. **Submit a pull request** with a clear description of your changes

## Code Style

- **Backend**: Follow standard Node.js conventions
- **Frontend**: TypeScript with React hooks
- **Formatting**: Use consistent indentation (2 spaces)
- **Comments**: Add comments for complex logic

## Testing

Currently, the project uses manual testing. When adding new features:

1. Test the happy path
2. Test error scenarios
3. Test on different devices/browsers
4. Verify WebSocket reconnection works

## Feature Ideas

Some areas where contributions would be welcome:

- [ ] Automated tests (Jest, Playwright)
- [ ] File size limits and validation
- [ ] Rate limiting
- [ ] Dark mode toggle
- [ ] More encryption options
- [ ] QR code for room sharing
- [ ] Notification sounds
- [ ] Improved mobile UX
- [ ] Internationalization (i18n)

## Bug Reports

When reporting bugs, please include:

- Browser and version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Console errors (if any)

## Questions?

Feel free to open an issue for any questions or discussions about the project.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
