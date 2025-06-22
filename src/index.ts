#!/usr/bin/env node
import { program } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';

const NODE_VERSION = '18';
const DEFAULT_PROJECT_NAME = 'my-express-api';

// Schema for field definitions
const FieldSchema = z.string().refine(
  (val) => /^[^:]+:[^:]+(:[^:]+)?$/.test(val),
  { message: 'Field must be in format name:type[:rule]' }
);

// Types
interface Field {
  name: string;
  type: string;
  rule?: string;
}

//FEATURES DESTRUCTURED
interface Feature {
  name: string;
  fields: string;
}

// Utility functions
const capitalize = (str: string): string =>
  str ? str.charAt(0).toUpperCase() + str.slice(1) : str;

const toTsType = (type: string): string => {
  switch (type) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    default: return 'any';
  }
};

const toMongooseType = (type: string): string => {
  switch (type) {
    case 'string': return 'String';
    case 'number': return 'Number';
    case 'boolean': return 'Boolean';
    default: return 'Mixed';
  }
};

const parseFields = (fields: string): Field[] => {
  if (!fields) return [];
  return fields.split(',').map((pair) => {
    const [name, type, rule] = pair.split(':');
    FieldSchema.parse(pair);
    return { name, type, rule };
  });
};

const getZodSchema = (fields: Field[]): string => {
  let schema = 'z.object({\n';
  for (const { name, type, rule } of fields) {
    let zodType: string;
    switch (type) {
      case 'string': zodType = 'z.string()'; break;
      case 'number': zodType = 'z.number()'; break;
      case 'boolean': zodType = 'z.boolean()'; break;
      default: zodType = 'z.any()';
    }
    if (rule) {
      switch (true) {
        case rule === 'email': zodType += '.email()'; break;
        case rule.startsWith('minlength='): zodType += `.min(${rule.split('=')[1]})`; break;
        case rule.startsWith('maxlength='): zodType += `.max(${rule.split('=')[1]})`; break;
        case rule.startsWith('min='): zodType += `.min(${rule.split('=')[1]})`; break;
        case rule.startsWith('max='): zodType += `.max(${rule.split('=')[1]})`; break;
        case rule.startsWith('enum='):
          const enums = rule.split('=')[1].split('|').map((e) => `"${e}"`).join(', ');
          zodType = `z.enum([${enums}])`;
          break;
      }
    }
    schema += `    ${name}: ${zodType},\n`;
  }
  schema += '})';
  return schema;
};

const getSampleJson = (fields: Field[]): string => {
  let json = '{';
  for (const { name, type, rule } of fields) {
    let value: string;
    if (type === 'string') {
      if (rule === 'email') value = '"test@example.com"';
      else if (rule?.startsWith('enum=')) value = `"${rule.split('=')[1].split('|')[0]}"`;
      else value = `"sample_${name}"`;
    } else if (type === 'number') value = '123';
    else if (type === 'boolean') value = 'true';
    else value = 'null';
    json += `"${name}": ${value}, `;
  }
  json = json.slice(0, -2) + '}';
  return json;
};

// File templates
const templates = {
  packageJson: (projectName: string) => `{
    "name": "${projectName}",
    "version": "1.0.0",
    "description": "Express API with TypeScript, MongoDB, and clean architecture",
    "main": "dist/Server/index.js",
    "scripts": {
      "start": "node dist/Server/index.js",
      "build": "tsc",
      "dev": "nodemon Server/index.ts",
      "test": "jest",
      "test:watch": "jest --watch"
    },
    "dependencies": {
      "dotenv": "^16.4.5",
      "express": "^4.21.1",
      "mongoose": "^8.7.2",
      "tsyringe": "^4.8.0",
      "zod": "^3.23.8"
    },
    "devDependencies": {
      "@types/express": "^5.0.0",
      "@types/jest": "^29.5.13",
      "@types/node": "^22.7.5",
      "@types/supertest": "^6.0.2",
      "jest": "^29.7.0",
      "nodemon": "^3.1.7",
      "supertest": "^7.0.0",
      "ts-jest": "^29.2.5",
      "ts-node": "^10.9.2",
      "typescript": "^5.6.3"
    }
  }`,
  tsconfigJson: `{
    "compilerOptions": {
      "target": "ES2020",
      "module": "commonjs",
      "outDir": "./dist",
      "rootDir": "./",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "experimentalDecorators": true,
      "emitDecoratorMetadata": true
    },
    "include": ["Core/**/*", "Features/**/*", "Server/**/*", "__tests__/**/*"],
    "exclude": ["node_modules", "dist"]
  }`,
  jestConfigTs: `export default {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js'],
    coverageDirectory: 'coverage',
    collectCoverageFrom: ['Features/**/*.{ts,js}', 'Core/**/*.{ts,js}'],
  };`,
  env: (projectName: string) => `PORT=3000
MONGODB_URI=mongodb://localhost:27017/${projectName}`,
  gitignore: `node_modules/
dist/
.env
coverage/`,
  resultTs: `export type Result<T, E> = Ok<T> | Err<E>;

interface Ok<T> {
  kind: 'Ok';
  value: T;
  isOk(): boolean;
  isErr(): boolean;
  unwrap(): T;
  unwrapErr(): never;
}

interface Err<E> {
  kind: 'Err';
  error: E;
  isOk(): boolean;
  isErr(): boolean;
  unwrap(): never;
  unwrapErr(): E;
}

export function Ok<T>(value: T): Ok<T> {
  return {
    kind: 'Ok',
    value,
    isOk: () => true,
    isErr: () => false,
    unwrap: () => value,
    unwrapErr: () => { throw new Error('Cannot unwrapErr an Ok value'); },
  };
}

export function Err<E>(error: E): Err<E> {
  return {
    kind: 'Err',
    error,
    isOk: () => false,
    isErr: () => true,
    unwrap: () => { throw new Error('Cannot unwrap an Err value'); },
    unwrapErr: () => error,
  };
}`,
  customErrorTs: `export class CustomError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'CustomError';
  }
}`,
  databaseTs: `import mongoose from 'mongoose';

export const connectToDatabase = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env');
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
};`,
  serverIndexTs: (features: Feature[]) => `import 'reflect-metadata';
import express from 'express';
import dotenv from 'dotenv';
import { container } from 'tsyringe';
import { connectToDatabase } from '../Core/config/database';
${features.map(({ name }) => `import { ${capitalize(name)}Controller } from '../Features/${name}/delivery/controllers/${name}.controller';`).join('\n')}

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
${features.map(({ name }) => `const ${name}Controller = container.resolve(${capitalize(name)}Controller);
app.use('/api/${name}', ${name}Controller.getRouter());`).join('\n')}

const startServer = async () => {
  try {
    await connectToDatabase();
    app.listen(port, () => {
      console.log(\`Server running on http://localhost:\${port}\`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
};

startServer();`,
  featureContainerTs: (feature: string) => `import 'reflect-metadata';
import { container } from 'tsyringe';
import { ${capitalize(feature)}Controller } from './delivery/controllers/${feature}.controller';
import { Create${capitalize(feature)}UseCase } from './domain/usecases/create-${feature}.usecase';
import { ${capitalize(feature)}RepositoryImpl } from './data/repositories/${feature}.repository';
import { ${capitalize(feature)}DataSource } from './data/datasources/${feature}.datasource';

container.register<Create${capitalize(feature)}UseCase>('Create${capitalize(feature)}UseCase', Create${capitalize(feature)}UseCase);
container.register<${capitalize(feature)}RepositoryImpl>('${capitalize(feature)}Repository', ${capitalize(feature)}RepositoryImpl);
container.register<${capitalize(feature)}DataSource>('${capitalize(feature)}DataSource', ${capitalize(feature)}DataSource);
container.register<${capitalize(feature)}Controller>(${capitalize(feature)}Controller, ${capitalize(feature)}Controller);

export { container };`,
  featureEntityTs: (feature: string, fields: Field[]) => `export class ${capitalize(feature)} {
  constructor(
    public id: string,
    public ${fields.map(({ name, type }) => `${name}: ${toTsType(type)}`).join(', ')}
  ) {}
}`,
  featureRepositoryInterfaceTs: (feature: string) => `import { Result } from '../../../../Core/result/result';
import { ${capitalize(feature)} } from '../entity/${feature}.entity';
import { CustomError } from '../../../../Core/error/custom-error';

export interface ${capitalize(feature)}Repository {
  create(${feature}: ${capitalize(feature)}): Promise<Result<${capitalize(feature)}, CustomError>>;
  findById(id: string): Promise<Result<${capitalize(feature)} | null, CustomError>>;
}`,
  featureUseCaseTs: (feature: string, fields: Field[]) => `import { injectable, inject } from 'tsyringe';
import { ${capitalize(feature)} } from '../entity/${feature}.entity';
import { ${capitalize(feature)}Repository } from '../repositories/${feature}.repository.interface';
import { Result, Ok, Err } from '../../../../Core/result/result';
import { CustomError } from '../../../../Core/error/custom-error';

export interface Create${capitalize(feature)}Dto {
  ${fields.map(({ name, type }) => `  ${name}: ${toTsType(type)};`).join('\n')}
}

@injectable()
export class Create${capitalize(feature)}UseCase {
  constructor(@inject('${capitalize(feature)}Repository') private ${feature}Repository: ${capitalize(feature)}Repository) {}

  async execute(dto: Create${capitalize(feature)}Dto): Promise<Result<${capitalize(feature)}, CustomError>> {
    const ${feature} = new ${capitalize(feature)}(
      Math.random().toString(36).substring(2), // Simple ID generation
      ${fields.map(({ name }) => `dto.${name}`).join(', ')}
    );
    return await this.${feature}Repository.create(${feature});
  }
}`,
  featureModelTs: (feature: string, fields: Field[]) => `import mongoose, { Schema, Document } from 'mongoose';

export interface I${capitalize(feature)} extends Document {
  id: string;
  ${fields.map(({ name, type }) => `${name}: ${toTsType(type)}`).join(';\n  ')};
}

const ${capitalize(feature)}Schema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  ${fields.map(({ name, type }) => `${name}: { type: ${toMongooseType(type)}, required: true }`).join(',\n  ')}
});

export const ${capitalize(feature)}Model = mongoose.model<I${capitalize(feature)}>('${capitalize(feature)}', ${capitalize(feature)}Schema);`,
  featureDataSourceTs: (feature: string, fields: Field[]) => `import { injectable } from 'tsyringe';
import { ${capitalize(feature)} } from '../../domain/entity/${feature}.entity';
import { ${capitalize(feature)}Model } from '../models/${feature}.model';
import { Result, Ok, Err } from '../../../../Core/result/result';
import { CustomError } from '../../../../Core/error/custom-error';

@injectable()
export class ${capitalize(feature)}DataSource {
  async create(${feature}: ${capitalize(feature)}): Promise<Result<${capitalize(feature)}, CustomError>> {
    try {
      const ${feature}Doc = new ${capitalize(feature)}Model(${feature});
      await ${feature}Doc.save();
      return Ok(${feature});
    } catch (error) {
      return Err(new CustomError(500, 'Failed to create ${feature}: ' + (error as Error).message));
    }
  }

  async findById(id: string): Promise<Result<${capitalize(feature)} | null, CustomError>> {
    try {
      const ${feature}Doc = await ${capitalize(feature)}Model.findOne({ id });
      if (!${feature}Doc) return Ok(null);
      return Ok(new ${capitalize(feature)}(${feature}Doc.id, ${fields.map(({ name }) => `${feature}Doc.${name}`).join(', ')}));
    } catch (error) {
      return Err(new CustomError(500, 'Failed to find ${feature}: ' + (error as Error).message));
    }
  }
}`,
  featureRepositoryTs: (feature: string) => `import { injectable, inject } from 'tsyringe';
import { ${capitalize(feature)} } from '../../domain/entity/${feature}.entity';
import { ${capitalize(feature)}Repository } from '../../domain/repositories/${feature}.repository.interface';
import { ${capitalize(feature)}DataSource } from '../datasources/${feature}.datasource';
import { Result } from '../../../../Core/result/result';
import { CustomError } from '../../../../Core/error/custom-error';

@injectable()
export class ${capitalize(feature)}RepositoryImpl implements ${capitalize(feature)}Repository {
  constructor(@inject('${capitalize(feature)}DataSource') private dataSource: ${capitalize(feature)}DataSource) {}

  async create(${feature}: ${capitalize(feature)}): Promise<Result<${capitalize(feature)}, CustomError>> {
    return await this.dataSource.create(${feature});
  }

  async findById(id: string): Promise<Result<${capitalize(feature)} | null, CustomError>> {
    return await this.dataSource.findById(id);
  }
}`,
  featureMiddlewareTs: (feature: string, zodSchema: string) => `import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CustomError } from '../../../Core/error/custom-error';

const ${feature}Schema = ${zodSchema};

export const validate${capitalize(feature)} = (req: Request, res: Response, next: NextFunction) => {
  try {
    ${feature}Schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new CustomError(400, error.errors.map(e => e.message).join(', '));
    }
    throw new CustomError(500, 'Validation error');
  }
};`,
  featureControllerTs: (feature: string) => `import { injectable, inject } from 'tsyringe';
import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { Create${capitalize(feature)}UseCase, Create${capitalize(feature)}Dto } from '../../domain/usecases/create-${feature}.usecase';
import { CustomError } from '../../../Core/error/custom-error';
import { validate${capitalize(feature)} } from '../middlewares/validate-${feature}.middleware';

@injectable()
export class ${capitalize(feature)}Controller {
  private router: Router;

  constructor(@inject('Create${capitalize(feature)}UseCase') private create${capitalize(feature)}UseCase: Create${capitalize(feature)}UseCase) {
    this.router = Router();
    this.router.post('/', validate${capitalize(feature)}, this.create${capitalize(feature)}.bind(this));
  }

  async create${capitalize(feature)}(req: Request, res: Response): Promise<void> {
    const dto: Create${capitalize(feature)}Dto = req.body;
    const result = await this.create${capitalize(feature)}UseCase.execute(dto);
    if (result.isOk()) {
      res.status(201).json(result.unwrap());
    } else {
      const error = result.unwrapErr();
      res.status(error.statusCode).json({ message: error.message });
    }
  }

  getRouter(): Router {
    return this.router;
  }
}`,
  featureUseCaseTestTs: (feature: string, fields: Field[], sampleJson: string) => `import { container } from 'tsyringe';
import { Create${capitalize(feature)}UseCase, Create${capitalize(feature)}Dto } from '../../../Features/${feature}/domain/usecases/create-${feature}.usecase';
import { ${capitalize(feature)}Repository } from '../../../Features/${feature}/domain/repositories/${feature}.repository.interface';
import { Result, Ok, Err } from '../../../Core/result/result';
import { CustomError } from '../../../Core/error/custom-error';
import { ${capitalize(feature)} } from '../../../Features/${feature}/domain/entity/${feature}.entity';

describe('Create${capitalize(feature)}UseCase', () => {
  let create${capitalize(feature)}UseCase: Create${capitalize(feature)}UseCase;
  let mockRepository: jest.Mocked<${capitalize(feature)}Repository>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
    };
    container.registerInstance('${capitalize(feature)}Repository', mockRepository);
    create${capitalize(feature)}UseCase = container.resolve<Create${capitalize(feature)}UseCase>('Create${capitalize(feature)}UseCase');
  });

  afterEach(() => {
    container.reset();
  });

  it('should create a ${feature} successfully', async () => {
    const dto: Create${capitalize(feature)}Dto = ${sampleJson};
    const ${feature} = new ${capitalize(feature)}('123', ${fields.map(({ name }) => `dto.${name}`).join(', ')});
    mockRepository.create.mockResolvedValue(Ok(${feature}));

    const result = await create${capitalize(feature)}UseCase.execute(dto);

    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toEqual(${feature});
    expect(mockRepository.create).toHaveBeenCalledWith(expect.any(${capitalize(feature)}));
  });

  it('should return an error if repository fails', async () => {
    const dto: Create${capitalize(feature)}Dto = ${sampleJson};
    const error = new CustomError(500, 'Repository error');
    mockRepository.create.mockResolvedValue(Err(error));

    const result = await create${capitalize(feature)}UseCase.execute(dto);

    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr()).toEqual(error);
  });
});`,
  featureControllerTestTs: (feature: string, fields: Field[], sampleJson: string) => `import request from 'supertest';
import express from 'express';
import { container } from 'tsyringe';
import { ${capitalize(feature)}Controller } from '../../../Features/${feature}/delivery/controllers/${feature}.controller';
import { Create${capitalize(feature)}UseCase } from '../../../Features/${feature}/domain/usecases/create-${feature}.usecase';
import { Result, Ok } from '../../../Core/result/result';
import { ${capitalize(feature)} } from '../../../Features/${feature}/domain/entity/${feature}.entity';

describe('${capitalize(feature)}Controller', () => {
  let app: express.Application;
  let mockUseCase: jest.Mocked<Create${capitalize(feature)}UseCase>;

  beforeEach(() => {
    mockUseCase = {
      execute: jest.fn(),
    };
    container.registerInstance('Create${capitalize(feature)}UseCase', mockUseCase);
    const controller = container.resolve(${capitalize(feature)}Controller);
    app = express();
    app.use(express.json());
    app.use('/api/${feature}', controller.getRouter());
  });

  afterEach(() => {
    container.reset();
  });

  it('should create a ${feature} and return 201', async () => {
    const dto = ${sampleJson};
    const ${feature} = new ${capitalize(feature)}('123', ${fields.map(({ name }) => `dto.${name}`).join(', ')});
    mockUseCase.execute.mockResolvedValue(Ok(${feature}));

    const response = await request(app)
      .post('/api/${feature}')
      .send(dto)
      .set('Accept', 'application/json');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: '123',
      ${fields.map(({ name }) => `${name}: dto.${name}`).join(', ')}
    });
    expect(mockUseCase.execute).toHaveBeenCalledWith(dto);
  });

  it('should return 400 for invalid input', async () => {
    const invalidDto = {};

    const response = await request(app)
      .post('/api/${feature}')
      .send(invalidDto)
      .set('Accept', 'application/json');

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('is required');
  });
};`,
  readmeMd: (projectName: string, features: Feature[], sampleJsons: string[]) => `# ${projectName}

A TypeScript-based Express API with MongoDB, Mongoose, clean architecture, Zod validation, tsyringe DI, and Jest testing.

## Setup

1. Ensure MongoDB is running locally or update \`.env\` with your MongoDB URI.
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
3. Run in development mode:
   \`\`\`bash
   npm run dev
   \`\`\`
4. Build for production:
   \`\`\`bash
   npm run build
   npm start
   \`\`\`
5. Run tests:
   \`\`\`bash
   npm test
   \`\`\`

## Testing

${features.map((f, i) => `- Create a ${f.name}:
  \`\`\`bash
  curl -X POST http://localhost:3000/api/${f.name} -H "Content-Type: application/json" -d '${sampleJsons[i]}'
  \`\`\``).join('\n')}

## Structure

- \`Core/\`: Shared utilities (config, error, result).
- \`Features/\`: Feature-specific modules (${features.map(f => f.name).join(', ')}).
  - \`domain/\`: Business logic (entities, use cases, repositories).
  - \`data/\`: Data access (models, data sources, repositories).
  - \`delivery/\`: HTTP layer (controllers, middleware).
  - \`container.ts\`: DI container setup.
- \`Server/\`: Application entry point.
- \`__tests__/\`: Jest tests for features.

## Notes

- Uses \`tsyringe\` for dependency injection and \`zod\` for validation.
- Run \`npm test\` to execute unit and integration tests.
- Ensure MongoDB is running for integration tests.`
};

// Main CLI logic
program
  .version('1.0.0')
  .description('CLI to generate TypeScript Express API with clean architecture');

program
  .command('create <project-name> [path]')
  .description('Create a new project')
  .option('--feature <feature-name> --fields <fields>', 'Add a feature with fields', (val, prev: string[]) => prev.concat(val), [])
  .action(async (projectName: string, pathSpec: string = '.', options: { feature?: string[] }) => {
    const features: Feature[] = [];
    let currentFeature: string | undefined;
    for (const arg of options.feature || []) {
      if (arg.startsWith('--feature=')) {
        currentFeature = arg.split('=')[1];
        features.push({ name: currentFeature, fields: '' });
      } else if (arg.startsWith('--fields=') && currentFeature) {
        features[features.length - 1].fields = arg.split('=')[1];
      }
    }
    await createProject(projectName, pathSpec, features);
  });

program
  .command('feature <feature-name>')
  .description('Add a feature to an existing project')
  .option('--fields <fields>', 'Fields for the feature')
  .action(async (featureName: string, options: { fields?: string }) => {
    await addFeature(featureName, options.fields || '');
  });

async function createProject(projectName: string, pathSpec: string, features: Feature[]) {
  const projectRoot = path.join(pathSpec, projectName);
  try {
    // Check Node.js version
    const nodeVersion = process.version.match(/^v(\d+)/)?.[1];
    if (!nodeVersion || parseInt(nodeVersion) < parseInt(NODE_VERSION)) {
      console.error(`Node.js version ${NODE_VERSION} or higher is required. Found: ${process.version}`);
      process.exit(1);
    }

    // Check if directory exists
    if (await fs.access(projectRoot).then(() => true).catch(() => false)) {
      console.error(`Directory ${projectRoot} already exists. Please remove it or choose a different name.`);
      process.exit(1);
    }

    // Create project structure
    await fs.mkdir(projectRoot, { recursive: true });

    // Create all directories first
    const directories = [
      'Core/config',
      'Core/error',
      'Core/result',
      'Server',
      '__tests__',
      ...features.flatMap(({ name }) => [
        `Features/${name}/domain/entity`,
        `Features/${name}/domain/usecases`,
        `Features/${name}/domain/repositories`,
        `Features/${name}/data/repositories`,
        `Features/${name}/data/datasources`,
        `Features/${name}/data/models`,
        `Features/${name}/delivery/routes`,
        `Features/${name}/delivery/controllers`,
        `Features/${name}/delivery/middlewares`,
        `__tests__/Features/${name}`
      ])
    ];

    await Promise.all(directories.map(dir => fs.mkdir(path.join(projectRoot, dir), { recursive: true })));
    console.log('Created core folder structure');

    // Change to project directory
    process.chdir(projectRoot);

    // Write core files
    await Promise.all([
      fs.writeFile('package.json', templates.packageJson(projectName)),
      fs.writeFile('tsconfig.json', templates.tsconfigJson),
      fs.writeFile('jest.config.ts', templates.jestConfigTs),
      fs.writeFile('.env', templates.env(projectName)),
      fs.writeFile('.gitignore', templates.gitignore),
      fs.writeFile('Core/result/result.ts', templates.resultTs),
      fs.writeFile('Core/error/custom-error.ts', templates.customErrorTs),
      fs.writeFile('Core/config/database.ts', templates.databaseTs),
      fs.writeFile('Server/index.ts', templates.serverIndexTs(features))
    ]);

    console.log('Initialized Node.js project');

    // Generate features
    const sampleJsons: string[] = [];
    for (const { name: feature, fields: fieldDefs } of features) {
      const fields = parseFields(fieldDefs || 'name:string:minlength=3,email:string:email');
      sampleJsons.push(getSampleJson(fields));
      await generateFeature(projectRoot, feature, fields);
    }

    // Write README
    await fs.writeFile('README.md', templates.readmeMd(projectName, features, sampleJsons));

    console.log('Project setup complete!');
    console.log('To start the development server, run:');
    console.log(`  cd ${projectRoot}`);
    console.log('  npm install');
    console.log('  npm run dev');
    console.log('To run tests, run:');
    console.log('  npm test');
    console.log('Ensure MongoDB is running and update .env with the correct MONGODB_URI if needed.');
  } catch (error) {
    console.error('Failed to create project:', error);
    process.exit(1);
  }
}

async function addFeature(featureName: string, fields: string) {
  const projectRoot = process.cwd();
  try {
    // Check if in a tsclean project
    if (!(await fs.access(path.join(projectRoot, 'Server/index.ts')).then(() => true).catch(() => false))) {
      console.error('Error: Current directory is not a tsclean project. Run from the project root.');
      process.exit(1);
    }

    const parsedFields = parseFields(fields || 'name:string:minlength=3,email:string:email');
    await generateFeature(projectRoot, featureName, parsedFields);

    // Update Server/index.ts
    const serverContent = await fs.readFile(path.join(projectRoot, 'Server/index.ts'), 'utf8');
    const feature = { name: featureName, fields };
    const newServerContent = templates.serverIndexTs([
      ...serverContent.match(/import { (\w+)Controller }/g)?.map(m => ({ name: m.match(/(\w+)Controller/)![1].toLowerCase(), fields: '' })) || [],
      feature
    ]);
    await fs.writeFile(path.join(projectRoot, 'Server/index.ts'), newServerContent);

    // Update README.md
    const readmeContent = await fs.readFile(path.join(projectRoot, 'README.md'), 'utf8');
    const projectName = readmeContent.match(/^# (.+)/m)?.[1] || 'Project';
    const existingFeatures = readmeContent.match(/Create a (\w+)/g)?.map(m => m.split(' ')[2]) || [];
    const newFeatures = [...existingFeatures, featureName].map((name, i) => ({
      name,
      fields: name === featureName ? fields : ''
    }));
    const sampleJsons = newFeatures.map(f => getSampleJson(parseFields(f.fields || 'name:string:minlength=3,email:string:email')));
    await fs.writeFile(path.join(projectRoot, 'README.md'), templates.readmeMd(projectName, newFeatures, sampleJsons));

    console.log(`Feature '${featureName}' added to ${projectName}`);
    console.log('Ensure MongoDB is running and update .env with the correct MONGODB_URI if needed.');
  } catch (error) {
    console.error('Failed to add feature:', error);
    process.exit(1);
  }
}

async function generateFeature(projectRoot: string, feature: string, fields: Field[]) {
  const featurePath = path.join('Features', feature);
  const zodSchema = getZodSchema(fields);
  const sampleJson = getSampleJson(fields);

  // Directories are already created in createProject for new projects
  // For addFeature, ensure feature-specific directories exist
  const featureDirs = [
    path.join(featurePath, 'domain/entity'),
    path.join(featurePath, 'domain/usecases'),
    path.join(featurePath, 'domain/repositories'),
    path.join(featurePath, 'data/repositories'),
    path.join(featurePath, 'data/datasources'),
    path.join(featurePath, 'data/models'),
    path.join(featurePath, 'delivery/routes'),
    path.join(featurePath, 'delivery/controllers'),
    path.join(featurePath, 'delivery/middlewares'),
    path.join('__tests__', 'Features', feature)
  ];

  await Promise.all(featureDirs.map(dir => fs.mkdir(path.join(projectRoot, dir), { recursive: true })));

  await Promise.all([
    fs.writeFile(path.join(projectRoot, featurePath, 'container.ts'), templates.featureContainerTs(feature)),
    fs.writeFile(path.join(projectRoot, featurePath, 'domain/entity', `${feature}.entity.ts`), templates.featureEntityTs(feature, fields)),
    fs.writeFile(path.join(projectRoot, featurePath, 'domain/repositories', `${feature}.repository.interface.ts`), templates.featureRepositoryInterfaceTs(feature)),
    fs.writeFile(path.join(projectRoot, featurePath, 'domain/usecases', `create-${feature}.usecase.ts`), templates.featureUseCaseTs(feature, fields)),
    fs.writeFile(path.join(projectRoot, featurePath, 'data/models', `${feature}.model.ts`), templates.featureModelTs(feature, fields)),
    fs.writeFile(path.join(projectRoot, featurePath, 'data/datasources', `${feature}.datasource.ts`), templates.featureDataSourceTs(feature, fields)),
    fs.writeFile(path.join(projectRoot, featurePath, 'data/repositories', `${feature}.repository.ts`), templates.featureRepositoryTs(feature)),
    fs.writeFile(path.join(projectRoot, featurePath, 'delivery/middlewares', `validate-${feature}.middleware.ts`), templates.featureMiddlewareTs(feature, zodSchema)),
    fs.writeFile(path.join(projectRoot, featurePath, 'delivery/controllers', `${feature}.controller.ts`), templates.featureControllerTs(feature)),
    fs.writeFile(path.join(projectRoot, '__tests__', 'Features', feature, `${feature}.usecase.test.ts`), templates.featureUseCaseTestTs(feature, fields, sampleJson)),
    fs.writeFile(path.join(projectRoot, '__tests__', 'Features', feature, `${feature}.controller.test.ts`), templates.featureControllerTestTs(feature, fields, sampleJson))
  ]);

  console.log(`Created folder structure for feature: ${feature}`);
}

program.parse(process.argv);