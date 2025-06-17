# tsclean: A TypeScript Clean Architecture Framework

## Overview

`tsclean` is a command-line interface (CLI) tool designed to scaffold TypeScript-based Express APIs adhering to clean architecture principles. Inspired by frameworks like NestJS, it aims to simplify the creation of scalable, maintainable, and testable server-side applications by enforcing a modular structure and providing utilities for common backend tasks. The project leverages TypeScript, Express, MongoDB, Mongoose, and a custom `Result` handler to ensure robust error handling and predictable outcomes.

The primary goal of `tsclean` is to evolve into a fully-fledged framework that rivals NestJS, offering a lightweight yet powerful alternative for developers who prioritize clean architecture without the overhead of a monolithic framework. It provides a CLI-driven workflow for generating projects and features, similar to `create-react-app`, making it accessible for rapid development while maintaining architectural rigor.

## Purpose

`tsclean` addresses the need for a standardized, clean architecture setup in TypeScript-based backend development. By automating the creation of project structures and feature modules, it reduces boilerplate code and enforces best practices, such as:

- **Separation of Concerns**: Organizes code into layers (domain, data, delivery) to isolate business logic from infrastructure concerns.
- **Testability**: Encourages dependency injection and interface-based design for easier unit testing.
- **Scalability**: Supports modular feature development, enabling large-scale applications.
- **Maintainability**: Uses TypeScript for type safety and a consistent structure for long-term code management.

The project aims to become a framework by introducing advanced features like dependency injection, middleware pipelines, and plugin support, positioning it as a viable alternative to NestJS for developers seeking a minimalist clean architecture solution.

## Current Features

### CLI Interface

- **Project Generation**:
  - Command: `tsclean <project-name> [path] [--feature <feature-name> --fields <field1:type1,field2:type2>]`
  - Example: `tsclean FoodStore ./ --feature products --fields name:string,price:number`
  - Creates a project with a predefined structure (`Core`, `Features`, `Server`), including TypeScript configuration, Express setup, MongoDB integration, and optional feature modules.
- **Feature Generation**:
  - Command: `tsclean feature <feature-name> [--fields <field1:type1,field2:type2>]`
  - Example: `tsclean feature payment --fields amount:number,method:string`
  - Adds a feature module to an existing project, updating `Server/index.ts` and `README.md` with relevant routes and testing instructions.
- **Global Installation**:
  - Install via npm: `npm install -g tsclean`
  - Supports cross-platform execution (PowerShell, Bash) with a dispatcher script to select the appropriate script (`tsclean.ps1` or `tsclean.sh`).

### Clean Architecture Structure

- **Core**:
  - `Core/config`: Database connection setup (MongoDB via Mongoose).
  - `Core/error`: Custom error handling with `CustomError` class.
  - `Core/result`: Monadic `Result<T, E>` type for handling success (`Ok`) and failure (`Err`) states.
- **Features**:
  - Each feature (e.g., `products`, `payment`) is a self-contained module with:
    - `domain`: Business logic (entities, use cases, repository interfaces).
    - `data`: Data access (Mongoose models, data sources, repository implementations).
    - `delivery`: HTTP layer (controllers, routes, middleware).
  - File Naming Conventions:
    - Controllers: `<feature>.controller.ts`
    - Routes: `<feature>.routes.ts`
    - Repositories: `<feature>.repository.ts`, `<feature>.repository.interface.ts`
- **Server**:
  - Entry point (`Server/index.ts`) that initializes Express, connects to MongoDB, and mounts feature routes.

### Custom Field Support

- **Field Definitions**:
  - Specify fields via `--fields` flag (e.g., `name:string,price:number`).
  - Supported types: `string`, `number`, `boolean`.
  - Applied to entities, DTOs, Mongoose models, and middleware validations.
- **Default Fields**: Falls back to `name:string,email:string` if `--fields` is omitted.
- **Validation**: Middleware ensures required fields are present in requests.

### Development Workflow

- **Dependencies**:
  - Express, Mongoose, TypeScript, dotenv, nodemon, ts-node.
  - Dev dependencies: `@types/express`, `@types/node`.
- **Scripts**:
  - `npm run dev`: Runs the server with nodemon for live reloading.
  - `npm run build`: Compiles TypeScript to JavaScript.
  - `npm start`: Runs the compiled server.
- **MongoDB Integration**:
  - Configurable via `.env` (`MONGODB_URI`).
  - Mongoose models generated per feature for data persistence.
- **Testing Instructions**:
  - Generated `README.md` includes `curl` commands for testing each feature's API endpoints.

### Cross-Platform Support

- **Windows**: PowerShell script (`tsclean.ps1`) for PowerShell and Command Prompt.
- **Unix-like**: Bash script (`tsclean.sh`) for Git Bash, WSL, Linux, macOS.
- **Dispatcher**: JavaScript `bin` script detects the platform and runs the appropriate script.

## Roadmap to Become a Framework

To transform `tsclean` into a framework like NestJS, the following enhancements are planned to enhance functionality, developer experience, and adoption.

### Short-Term Improvements

1. **Advanced Validation**:
   - Support validation rules in `--fields` (e.g., `email:string:email,age:number:min=18`).
   - Integrate a validation library (e.g., `zod`, `class-validator`) for runtime checks.
   - Generate middleware with type-specific validations (e.g., email format, number ranges).
2. **Extended Type Support**:
   - Add support for `Date`, `ObjectId`, arrays, and nested objects in `--fields`.
   - Map complex types to Mongoose schemas and TypeScript interfaces.
3. **Dependency Injection**:
   - Introduce a DI container (e.g., `tsyringe`, `inversify`) for managing dependencies.
   - Enable injectable services, repositories, and controllers within features.
4. **Testing Setup**:
   - Generate test scaffolds using `jest` and `supertest` for each feature.
   - Include unit tests for use cases and integration tests for routes.
5. **Async Handling**:
   - Replace the simplified async wrapper in `<feature>.repository.ts` with proper async/await or callback patterns.
   - Explore synchronous MongoDB drivers or better `Result` integration for async operations.
6. **Feature Modification**:
   - Add CLI commands to modify existing features (e.g., `tsclean update-feature products --add-field stock:number`).
   - Update entities, DTOs, models, and middleware accordingly.

### Mid-Term Goals

1. **Module System**:
   - Introduce a module-based architecture like NestJS, where features are registered as modules.
   - Support dynamic module imports and configuration (e.g., database providers, external APIs).
2. **Middleware Pipeline**:
   - Allow global and feature-specific middleware registration via decorators or configuration.
   - Support authentication, logging, and rate-limiting middleware out of the box.
3. **CLI Enhancements**:
   - Add commands for generating middleware, guards, interceptors, and pipes (inspired by NestJS CLI).
   - Support template customization for generated files.
4. **ORM/ODM Flexibility**:
   - Abstract the data layer to support multiple ORMs/ODMs (e.g., TypeORM, Prisma) alongside Mongoose.
   - Provide CLI flags to choose the data provider (e.g., `tsclean FoodStore ./ --orm typeorm`).
5. **Configuration Management**:
   - Introduce a configuration module for environment-specific settings (e.g., `ConfigModule`).
   - Support YAML, JSON, or TypeScript-based configuration files.

### Long-Term Vision

1. **Framework Core**:

   - Develop a runtime framework (beyond CLI scaffolding) with a core library (`@tsclean/core`).
   - Provide APIs for bootstrapping applications, registering modules, and handling requests.
   - Example:

     ```typescript
     import { TscleanModule } from "@tsclean/core";
     import { ProductsModule } from "./features/products/products.module";

     TscleanModule.bootstrap({
       modules: [ProductsModule],
       port: 3000,
     });
     ```

2. **Decorators and Metadata**:
   - Implement decorators for controllers, routes, and injectable services (similar to NestJS `@Controller`, `@Injectable`).
   - Use TypeScript metadata reflection for runtime configuration.
3. **Plugin Ecosystem**:
   - Create a plugin system for third-party integrations (e.g., GraphQL, WebSockets, Redis).
   - Publish packages like `@tsclean/graphql`, `@tsclean/websockets`.
4. **Performance Optimizations**:
   - Optimize startup time and request handling for production environments.
   - Support clustering and load balancing for high-traffic applications.
5. **Documentation and Community**:
   - Build a comprehensive documentation site with tutorials, API references, and examples.
   - Foster a community through GitHub, Discord, and npm package contributions.
   - Publish `tsclean` to npm as a framework (`@tsclean/cli`, `@tsclean/core`).

### Comparison to NestJS

| Feature              | tsclean (Current)            | tsclean (Future)                      | NestJS                               |
| -------------------- | ---------------------------- | ------------------------------------- | ------------------------------------ |
| CLI Scaffolding      | Yes (project, features)      | Enhanced (modules, middleware, tests) | Yes (modules, controllers, services) |
| Clean Architecture   | Yes (domain, data, delivery) | Enhanced (DI, modules)                | Partial (modular, but not strict)    |
| Dependency Injection | No                           | Yes (tsyringe/inversify)              | Yes (built-in)                       |
| Decorators           | No                           | Yes (controllers, routes)             | Yes (extensive)                      |
| ORM/ODM Support      | Mongoose                     | Multiple (TypeORM, Prisma)            | Multiple (TypeORM, Sequelize, etc.)  |
| Testing Support      | Manual (README instructions) | Automated (jest, supertest)           | Yes (jest integration)               |
| Plugin Ecosystem     | No                           | Yes (GraphQL, WebSockets)             | Yes (extensive)                      |
| Runtime Framework    | No (CLI only)                | Yes (@tsclean/core)                   | Yes (core framework)                 |

`tsclean` aims to match NestJS's developer experience while maintaining a lightweight footprint and strict adherence to clean architecture.

## Getting Started

### Installation

```bash
npm install -g tsclean
```

### Create a Project

```bash
tsclean FoodStore ./ --feature products --fields name:string,price:number --feature payment --fields amount:number,method:string
```

### Add a Feature

```bash
cd FoodStore
tsclean feature orders --fields orderId:string,total:number
```

### Run the Project

```bash
cd FoodStore
npm run dev
```

### Test Endpoints

- Create a product:
  ```bash
  curl -X POST http://localhost:3000/api/products -H "Content-Type: application/json" -d '{"name":"Apple","price":0.99}'
  ```
- Create a payment:
  ```bash
  curl -X POST http://localhost:3000/api/payment -H "Content-Type: application/json" -d '{"amount":100,"method":"credit"}'
  ```

## Quick Start Example

```bash
# Install globally
npm install -g tsclean

# Scaffold a new project with a feature
tsclean MyApp ./ --feature users --fields name:string,email:string

cd MyApp
npm run dev
```

Visit `http://localhost:3000/api/users` to see your API in action!

## Why tsclean?

- **Strict Clean Architecture**: Enforces separation of concerns for scalable codebases.
- **CLI Productivity**: Generate features, models, and routes in seconds.
- **TypeScript First**: Type safety across your stack.
- **Lightweight**: Minimal dependencies, fast startup.

## Contributing

Contributions are welcome! To contribute:

1. Fork the repository on GitHub.
2. Create a feature branch (`git checkout -b feature/new-feature`).
3. Commit changes (`git commit -m "Add new feature"`).
4. Push to the branch (`git push origin feature/new-feature`).
5. Open a pull request.

Focus areas for contributions:

- Enhancing CLI commands and templates.
- Implementing dependency injection and decorators.
- Adding support for additional ORMs and plugins.
- Improving documentation and examples.

## License

MIT License. See [LICENSE](LICENSE) for details.

## Roadmap Timeline (Tentative)

- **Q3 2025**: Validation, testing setup, dependency injection.
- **Q4 2025**: Module system, middleware pipeline, CLI enhancements.
- **Q1 2026**: Framework core, decorators, plugin ecosystem.
- **Q2 2026**: Performance optimizations, community documentation.

`tsclean` is poised to become a leading TypeScript clean architecture framework, combining simplicity, modularity, and power for modern backend development.
