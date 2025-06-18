#!/bin/bash

# Bash script to set up a TypeScript Express API with MongoDB, Mongoose, clean architecture, Zod validation, tsyringe DI, and Jest testing
# Usage: tsclean <project-name> [path] [--feature <feature-name> --fields <field1:type1:rule1,field2:type2:rule2> ...]
#        tsclean feature <feature-name> [--fields <field1:type1:rule1,field2:type2:rule2>]
# Example: tsclean FoodStore ./ --feature products --fields name:string:minlength=3,price:number:min=0
#          tsclean feature payment --fields amount:number:min=0,method:string:enum=credit|debit

DEFAULT_PROJECT_NAME="my-express-api"
PROJECT_NAME="$DEFAULT_PROJECT_NAME"
PATH_SPECIFIED="."
FEATURES=()
FIELD_DEFS=()
NODE_VERSION="18"

# Function to capitalize first letter
capitalize() {
    echo "$(tr '[:lower:]' '[:upper:]' <<< ${1:0:1})${1:1}"
}

# Function to convert type to TypeScript type
to_ts_type() {
    case "$1" in
        string) echo "string" ;;
        number) echo "number" ;;
        boolean) echo "boolean" ;;
        *) echo "any" ;;
    esac
}

# Function to convert type to Mongoose type
to_mongoose_type() {
    case "$1" in
        string) echo "String" ;;
        number) echo "Number" ;;
        boolean) echo "Boolean" ;;
        *) echo "Mixed" ;;
    esac
}

# Function to parse fields and validation rules
parse_fields() {
    local fields="$1"
    field_names=()
    field_types=()
    field_rules=()
    IFS=',' read -ra field_pairs <<< "$fields"
    for pair in "${field_pairs[@]}"; do
        IFS=':' read -r name type rule <<< "$pair"
        field_names+=("$name")
        field_types+=("$type")
        field_rules+=("${rule:-}")
    done
}

# Function to generate Zod validation schema
get_zod_schema() {
    local field_names=("${!1}")
    local field_types=("${!2}")
    local field_rules=("${!3}")
    zod_schema="z.object({"
    for i in "${!field_names[@]}"; do
        name="${field_names[$i]}"
        type="${field_types[$i]}"
        rule="${field_rules[$i]}"
        case "$type" in
            string) zod_type="z.string()" ;;
            number) zod_type="z.number()" ;;
            boolean) zod_type="z.boolean()" ;;
            *) zod_type="z.any()" ;;
        esac
        if [ -n "$rule" ]; then
            case "$rule" in
                email) zod_type="$zod_type.email()" ;;
                minlength=*) zod_type="$zod_type.min(${rule#minlength=})" ;;
                maxlength=*) zod_type="$zod_type.max(${rule#maxlength=})" ;;
                min=*) zod_type="$zod_type.min(${rule#min=})" ;;
                max=*) zod_type="$zod_type.max(${rule#max=})" ;;
                enum=*) 
                    enums="${rule#enum=}"
                    IFS='|' read -ra enum_values <<< "$enums"
                    enum_str=$(printf "\"%s\"," "${enum_values[@]}" | sed 's/,$//')
                    zod_type="z.enum([$enum_str])"
                    ;;
            esac
        fi
        zod_schema="$zod_schema\n    $name: $zod_type,"
    done
    zod_schema="$zod_schema\n})"
    echo -e "$zod_schema"
}

# Parse command-line arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 <project-name> [path] [--feature <feature-name> --fields <field1:type1:rule1,field2:type2:rule2> ...]"
    echo "       $0 feature <feature-name> [--fields <field1:type1:rule1,field2:type2:rule2>]"
    echo "Example: $0 FoodStore ./ --feature products --fields name:string:minlength=3,price:number:min=0"
    exit 1
fi

COMMAND="$1"
shift

if [ "$COMMAND" = "feature" ]; then
    if [ $# -eq 0 ]; then
        echo "Error: feature command requires a feature name"
        exit 1
    fi
    feature="$1"
    shift
    fields=""
    if [ "$1" = "--fields" ]; then
        shift
        if [ -z "$1" ]; then
            echo "Error: --fields requires a comma-separated list of field:type:rule pairs"
            exit 1
        fi
        fields="$1"
    fi
    FEATURES+=("$feature")
    FIELD_DEFS+=("$fields")
    PROJECT_ROOT="$(pwd)"
else
    PROJECT_NAME="$COMMAND"
    if [ $# -gt 0 ] && [[ "$1" != --* ]]; then
        PATH_SPECIFIED="$1"
        shift
    fi
    current_feature=""
    while [ $# -gt 0 ]; do
        if [ "$1" = "--feature" ]; then
            shift
            if [ -z "$1" ]; then
                echo "Error: --feature requires a feature name"
                exit 1
            fi
            current_feature="$1"
            FEATURES+=("$current_feature")
            FIELD_DEFS+=("")
        elif [ "$1" = "--fields" ]; then
            shift
            if [ -z "$current_feature" ]; then
                echo "Error: --fields must follow a --feature flag"
                exit 1
            fi
            if [ -z "$1" ]; then
                echo "Error: --fields requires a comma-separated list of field:type:rule pairs"
                exit 1
            fi
            FIELD_DEFS[${#FIELD_DEFS[@]}-1]="$1"
        else
            echo "Unknown argument: $1"
            exit 1
        fi
        shift
    done
    PROJECT_ROOT="$PATH_SPECIFIED/$PROJECT_NAME"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js version $NODE_VERSION or higher."
    exit 1
fi

NODE_MAJOR=$(node -v | cut -d. -f1 | cut -dv -f2)
if [ "$NODE_MAJOR" -lt "$NODE_VERSION" ]; then
    echo "Node.js version $NODE_VERSION or higher is required. Found: $(node -v)"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install npm."
    exit 1
fi

# Check TypeScript
if ! command -v tsc &> /dev/null; then
    echo "TypeScript is not installed globally. Installing..."
    npm install -g typescript
fi

# If adding a feature, update existing project
if [ "$COMMAND" = "feature" ]; then
    if [ ! -f "Server/index.ts" ]; then
        echo "Error: Current directory is not a tsclean project. Run from the project root."
        exit 1
    fi
    echo "Adding feature: ${FEATURES[0]}"
else
    # Create project directory
    if [ -d "$PROJECT_ROOT" ]; then
        echo "Directory $PROJECT_ROOT already exists. Please remove it or choose a different name."
        exit 1
    fi
    mkdir -p "$PROJECT_ROOT"
    cd "$PROJECT_ROOT" || exit
    echo "Setting up project: $PROJECT_NAME"

    # Initialize Node.js project
    npm init -y > /dev/null
    echo "Initialized Node.js project"

    # Create package.json
    cat > package.json << EOL
{
  "name": "$PROJECT_NAME",
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
}
EOL
    echo "Created package.json"

    # Install dependencies
    echo "Installing dependencies..."
    npm install > /dev/null 2>&1
    echo "Dependencies installed"

    # Create folder structure
    mkdir -p Core/config Core/error Core/result Server __tests__
    echo "Created core folder structure"

    # Create .env
    cat > .env << EOL
PORT=3000
MONGODB_URI=mongodb://localhost:27017/$PROJECT_NAME
EOL
    echo "Created .env"

    # Create .gitignore
    cat > .gitignore << EOL
node_modules/
dist/
.env
coverage/
EOL
    echo "Created .gitignore"

    # Create tsconfig.json
    cat > tsconfig.json << EOL
{
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
}
EOL
    echo "Created tsconfig.json"

    # Create jest.config.ts
    cat > jest.config.ts << EOL
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['Features/**/*.{ts,js}', 'Core/**/*.{ts,js}'],
};
EOL
    echo "Created jest.config.ts"

    # Create Core/result/result.ts
    cat > Core/result/result.ts << EOL
export type Result<T, E> = Ok<T> | Err<E>;

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
}
EOL
    echo "Created Core/result/result.ts"

    # Create Core/error/custom-error.ts
    cat > Core/error/custom-error.ts << EOL
export class CustomError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'CustomError';
  }
}
EOL
    echo "Created Core/error/custom-error.ts"

    # Create Core/config/database.ts
    cat > Core/config/database.ts << EOL
import mongoose from 'mongoose';

export const connectToDatabase = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env');
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
};
EOL
    echo "Created Core/config/database.ts"
fi

# Generate or update Server/index.ts
server_content="import 'reflect-metadata';
import express from 'express';
import dotenv from 'dotenv';
import { container } from 'tsyringe';
import { connectToDatabase } from '../Core/config/database';
$(for feature in "${FEATURES[@]}"; do
    Feature=$(capitalize "$feature")
    echo "import { ${Feature}Controller } from '../Features/$feature/delivery/controllers/$feature.controller';"
done)

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
$(for feature in "${FEATURES[@]}"; do
    Feature=$(capitalize "$feature")
    echo "const ${feature}Controller = container.resolve(${Feature}Controller);"
    echo "app.use('/api/$feature', ${feature}Controller.getRouter());"
done)

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

startServer();"
echo "$server_content" > Server/index.ts
echo "Created/Updated Server/index.ts"

# Generate feature-specific files
sample_jsons=()
for i in "${!FEATURES[@]}"; do
    feature="${FEATURES[$i]}"
    fields="${FIELD_DEFS[$i]}"
    Feature=$(capitalize "$feature")

    # Default fields if none provided
    if [ -z "$fields" ]; then
        fields="name:string:minlength=3,email:string:email"
    fi

    # Parse fields
    parse_fields "$fields"
    entity_fields=""
    dto_fields=""
    model_fields=""
    sample_json=""
    for j in "${!field_names[@]}"; do
        name="${field_names[$j]}"
        type="${field_types[$j]}"
        rule="${field_rules[$j]}"
        ts_type=$(to_ts_type "$type")
        mongoose_type=$(to_mongoose_type "$type")
        entity_fields+="$name: $ts_type, "
        dto_fields+="$name: $ts_type;\n    "
        model_fields+="$name: { type: $mongoose_type, required: true },\n    "
        case "$type" in
            string)
                if [ "$rule" = "email" ]; then
                    sample_json+="\"$name\": \"test@example.com\", "
                elif [[ "$rule" =~ ^enum=.* ]]; then
                    enum_value=$(echo "$rule" | cut -d'=' -f2 | cut -d'|' -f1)
                    sample_json+="\"$name\": \"$enum_value\", "
                else
                    sample_json+="\"$name\": \"sample_${name}\", "
                fi
                ;;
            number) sample_json+="\"$name\": 123, " ;;
            boolean) sample_json+="\"$name\": true, " ;;
            *) sample_json+="\"$name\": null, " ;;
        esac
    done
    entity_fields="${entity_fields%, }"
    sample_json="${sample_json%, }"
    sample_jsons+=("{$sample_json}")
    zod_schema=$(get_zod_schema field_names[@] field_types[@] field_rules[@])

    mkdir -p "Features/$feature/domain/entity" "Features/$feature/domain/usecases" "Features/$feature/domain/repositories"
    mkdir -p "Features/$feature/data/repositories" "Features/$feature/data/datasources" "Features/$feature/data/models"
    mkdir -p "Features/$feature/delivery/routes" "Features/$feature/delivery/controllers" "Features/$feature/delivery/middlewares"
    mkdir -p "__tests__/Features/$feature"
    echo "Created folder structure for feature: $feature"

    # Create Features/<feature>/container.ts
    cat > "Features/$feature/container.ts" << EOL
import 'reflect-metadata';
import { container } from 'tsyringe';
import { ${Feature}Controller } from './delivery/controllers/$feature.controller';
import { Create${Feature}UseCase } from './domain/usecases/create-$feature.usecase';
import { ${Feature}RepositoryImpl } from './data/repositories/$feature.repository';
import { ${Feature}DataSource } from './data/datasources/$feature.datasource';

container.register<Create${Feature}UseCase>('Create${Feature}UseCase', Create${Feature}UseCase);
container.register<${Feature}RepositoryImpl>('${Feature}Repository', ${Feature}RepositoryImpl);
container.register<${Feature}DataSource>('${Feature}DataSource', ${Feature}DataSource);
container.register<${Feature}Controller>(${Feature}Controller, ${Feature}Controller);

export { container };
EOL
    echo "Created Features/$feature/container.ts"

    # Create Features/<feature>/domain/entity/<feature>.entity.ts
    cat > "Features/$feature/domain/entity/$feature.entity.ts" << EOL
export class $Feature {
  constructor(
    public id: string,
    public $entity_fields
  ) {}
}
EOL
    echo "Created Features/$feature/domain/entity/$feature.entity.ts"

    # Create Features/<feature>/domain/repositories/<feature>.repository.interface.ts
    cat > "Features/$feature/domain/repositories/$feature.repository.interface.ts" << EOL
import { Result } from '../../../../Core/result/result';
import { $Feature } from '../entity/$feature.entity';
import { CustomError } from '../../../../Core/error/custom-error';

export interface ${Feature}Repository {
  create(${feature}: $Feature): Promise<Result<$Feature, CustomError>>;
  findById(id: string): Promise<Result<$Feature | null, CustomError>>;
}
EOL
    echo "Created Features/$feature/domain/repositories/$feature.repository.interface.ts"

    # Create Features/<feature>/domain/usecases/create-<feature>.usecase.ts
    cat > "Features/$feature/domain/usecases/create-$feature.usecase.ts" << EOL
import { injectable, inject } from 'tsyringe';
import { $Feature } from '../entity/$feature.entity';
import { ${Feature}Repository } from '../repositories/$feature.repository.interface';
import { Result, Ok, Err } from '../../../../Core/result/result';
import { CustomError } from '../../../../Core/error/custom-error';

export interface Create${Feature}Dto {
  $dto_fields
}

@injectable()
export class Create${Feature}UseCase {
  constructor(@inject('${Feature}Repository') private ${feature}Repository: ${Feature}Repository) {}

  async execute(dto: Create${Feature}Dto): Promise<Result<$Feature, CustomError>> {
    const ${feature} = new $Feature(
      Math.random().toString(36).substring(2), // Simple ID generation
      $(for name in "${field_names[@]}"; do echo "dto.$name,"; done | tr '\n' ' ')
    );
    return await this.${feature}Repository.create(${feature});
  }
}
EOL
    echo "Created Features/$feature/domain/usecases/create-$feature.usecase.ts"

    # Create Features/<feature>/data/models/<feature>.model.ts
    cat > "Features/$feature/data/models/$feature.model.ts" << EOL
import mongoose, { Schema, Document } from 'mongoose';

export interface I$Feature extends Document {
  id: string;
  $entity_fields
}

const ${Feature}Schema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  $model_fields
});

export const ${Feature}Model = mongoose.model<I$Feature>('$Feature', ${Feature}Schema);
EOL
    echo "Created Features/$feature/data/models/$feature.model.ts"

    # Create Features/<feature>/data/datasources/<feature>.datasource.ts
    cat > "Features/$feature/data/datasources/$feature.datasource.ts" << EOL
import { injectable } from 'tsyringe';
import { $Feature } from '../../domain/entity/$feature.entity';
import { ${Feature}Model } from '../models/$feature.model';
import { Result, Ok, Err } from '../../../../Core/result/result';
import { CustomError } from '../../../../Core/error/custom-error';

@injectable()
export class ${Feature}DataSource {
  async create(${feature}: $Feature): Promise<Result<$Feature, CustomError>> {
    try {
      const ${feature}Doc = new ${Feature}Model(${feature});
      await ${feature}Doc.save();
      return Ok(${feature});
    } catch (error) {
      return Err(new CustomError(500, 'Failed to create ${feature}: ' + (error as Error).message));
    }
  }

  async findById(id: string): Promise<Result<$Feature | null, CustomError>> {
    try {
      const ${feature}Doc = await ${Feature}Model.findOne({ id });
      if (!${feature}Doc) return Ok(null);
      return Ok(new $Feature(${feature}Doc.id, $(for name in "${field_names[@]}"; do echo "${feature}Doc.$name,"; done | tr '\n' ' ')));
    } catch (error) {
      return Err(new CustomError(500, 'Failed to find ${feature}: ' + (error as Error).message));
    }
  }
}
EOL
    echo "Created Features/$feature/data/datasources/$feature.datasource.ts"

    # Create Features/<feature>/data/repositories/<feature>.repository.ts
    cat > "Features/$feature/data/repositories/$feature.repository.ts" << EOL
import { injectable, inject } from 'tsyringe';
import { $Feature } from '../../domain/entity/$feature.entity';
import { ${Feature}Repository } from '../../domain/repositories/$feature.repository.interface';
import { ${Feature}DataSource } from '../datasources/$feature.datasource';
import { Result } from '../../../../Core/result/result';
import { CustomError } from '../../../../Core/error/custom-error';

@injectable()
export class ${Feature}RepositoryImpl implements ${Feature}Repository {
  constructor(@inject('${Feature}DataSource') private dataSource: ${Feature}DataSource) {}

  async create(${feature}: $Feature): Promise<Result<$Feature, CustomError>> {
    return await this.dataSource.create(${feature});
  }

  async findById(id: string): Promise<Result<$Feature | null, CustomError>> {
    return await this.dataSource.findById(id);
  }
}
EOL
    echo "Created Features/$feature/data/repositories/$feature.repository.ts"

    # Create Features/<feature>/delivery/middlewares/validate-<feature>.middleware.ts
    cat > "Features/$feature/delivery/middlewares/validate-$feature.middleware.ts" << EOL
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CustomError } from '../../../Core/error/custom-error';

const ${feature}Schema = $zod_schema;

export const validate${Feature} = (req: Request, res: Response, next: NextFunction) => {
  try {
    ${feature}Schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new CustomError(400, error.errors.map(e => e.message).join(', '));
    }
    throw new CustomError(500, 'Validation error');
  }
};
EOL
    echo "Created Features/$feature/delivery/middlewares/validate-$feature.middleware.ts"

    # Create Features/<feature>/delivery/controllers/<feature>.controller.ts
    cat > "Features/$feature/delivery/controllers/$feature.controller.ts" << EOL
import { injectable, inject } from 'tsyringe';
import { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { Create${Feature}UseCase, Create${Feature}Dto } from '../../domain/usecases/create-$feature.usecase';
import { CustomError } from '../../../Core/error/custom-error';
import { validate${Feature} } from '../middlewares/validate-$feature.middleware';

@injectable()
export class ${Feature}Controller {
  private router: Router;

  constructor(@inject('Create${Feature}UseCase') private create${Feature}UseCase: Create${Feature}UseCase) {
    this.router = Router();
    this.router.post('/', validate${Feature}, this.create${Feature}.bind(this));
  }

  async create${Feature}(req: Request, res: Response): Promise<void> {
    const dto: Create${Feature}Dto = req.body;
    const result = await this.create${Feature}UseCase.execute(dto);
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
}
EOL
    echo "Created Features/$feature/delivery/controllers/$feature.controller.ts"

    # Create __tests__/Features/<feature>/<feature>.usecase.test.ts
    cat > "__tests__/Features/$feature/$feature.usecase.test.ts" << EOL
import { container } from 'tsyringe';
import { Create${Feature}UseCase, Create${Feature}Dto } from '../../../Features/$feature/domain/usecases/create-$feature.usecase';
import { ${Feature}Repository } from '../../../Features/$feature/domain/repositories/$feature.repository.interface';
import { Result, Ok, Err } from '../../../Core/result/result';
import { CustomError } from '../../../Core/error/custom-error';
import { $Feature } from '../../../Features/$feature/domain/entity/$feature.entity';

describe('Create${Feature}UseCase', () => {
  let create${Feature}UseCase: Create${Feature}UseCase;
  let mockRepository: jest.Mocked<${Feature}Repository>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
    };
    container.registerInstance('${Feature}Repository', mockRepository);
    create${Feature}UseCase = container.resolve<Create${Feature}UseCase>('Create${Feature}UseCase');
  });

  afterEach(() => {
    container.reset();
  });

  it('should create a $feature successfully', async () => {
    const dto: Create${Feature}Dto = ${sample_jsons[$i]};
    const ${feature} = new $Feature('123', $(for name in "${field_names[@]}"; do echo "dto.$name,"; done | tr '\n' ' '));
    mockRepository.create.mockResolvedValue(Ok(${feature}));

    const result = await create${Feature}UseCase.execute(dto);

    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toEqual(${feature});
    expect(mockRepository.create).toHaveBeenCalledWith(expect.any($Feature));
  });

  it('should return an error if repository fails', async () => {
    const dto: Create${Feature}Dto = ${sample_jsons[$i]};
    const error = new CustomError(500, 'Repository error');
    mockRepository.create.mockResolvedValue(Err(error));

    const result = await create${Feature}UseCase.execute(dto);

    expect(result.isErr()).toBe(true);
    expect(result.unwrapErr()).toEqual(error);
  });
});
EOL
    echo "Created __tests__/Features/$feature/$feature.usecase.test.ts"

    # Create __tests__/Features/<feature>/<feature>.controller.test.ts
    cat > "__tests__/Features/$feature/$feature.controller.test.ts" << EOL
import request from 'supertest';
import express from 'express';
import { container } from 'tsyringe';
import { ${Feature}Controller } from '../../../Features/$feature/delivery/controllers/$feature.controller';
import { Create${Feature}UseCase } from '../../../Features/$feature/domain/usecases/create-$feature.usecase';
import { Result, Ok } from '../../../Core/result/result';
import { $Feature } from '../../../Features/$feature/domain/entity/$feature.entity';

describe('${Feature}Controller', () => {
  let app: express.Application;
  let mockUseCase: jest.Mocked<Create${Feature}UseCase>;

  beforeEach(() => {
    mockUseCase = {
      execute: jest.fn(),
    };
    container.registerInstance('Create${Feature}UseCase', mockUseCase);
    const controller = container.resolve(${Feature}Controller);
    app = express();
    app.use(express.json());
    app.use('/api/$feature', controller.getRouter());
  });

  afterEach(() => {
    container.reset();
  });

  it('should create a $feature and return 201', async () => {
    const dto = ${sample_jsons[$i]};
    const ${feature} = new $Feature('123', $(for name in "${field_names[@]}"; do echo "dto.$name,"; done | tr '\n' ' '));
    mockUseCase.execute.mockResolvedValue(Ok(${feature}));

    const response = await request(app)
      .post('/api/$feature')
      .send(dto)
      .set('Accept', 'application/json');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: '123',
      $(for name in "${field_names[@]}"; do echo "$name: dto.$name,"; done | tr '\n' ' ')
    });
    expect(mockUseCase.execute).toHaveBeenCalledWith(dto);
  });

  it('should return 400 for invalid input', async () => {
    const invalidDto = {};

    const response = await request(app)
      .post('/api/$feature')
      .send(invalidDto)
      .set('Accept', 'application/json');

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('is required');
  });
});
EOL
    echo "Created __tests__/Features/$feature/$feature.controller.test.ts"
done

# Create/Update README.md
readme_content="# $PROJECT_NAME

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

$(for i in "${!FEATURES[@]}"; do
    feature="${FEATURES[$i]}"
    echo "- Create a ${feature}:"
    echo "  \`\`\`bash"
    echo "  curl -X POST http://localhost:3000/api/${feature} -H \"Content-Type: application/json\" -d '${sample_jsons[$i]}'"
    echo "  \`\`\`"
done)

## Structure

- \`Core/\`: Shared utilities (config, error, result).
- \`Features/\`: Feature-specific modules (${FEATURES[*]}).
  - \`domain/\`: Business logic (entities, use cases, repositories).
  - \`data/\`: Data access (models, data sources, repositories).
  - \`delivery/\`: HTTP layer (controllers, middleware).
  - \`container.ts\`: DI container setup.
- \`Server/\`: Application entry point.
- \`__tests__/\`: Jest tests for features.

## Notes

- Uses \`tsyringe\` for dependency injection and \`zod\` for validation.
- Run \`npm test\` to execute unit and integration tests.
- Ensure MongoDB is running for integration tests.
"
echo "$readme_content" > README.md
echo "Created/Updated README.md"

echo "Project setup complete!"
if [ "$COMMAND" = "feature" ]; then
    echo "Feature '${FEATURES[0]}' added to $PROJECT_NAME"
else
    echo "To start the development server, run:"
    echo "  cd $PROJECT_ROOT"
    echo "  npm run dev"
    echo "To run tests, run:"
    echo "  npm test"
fi
echo "Ensure MongoDB is running and update .env with the correct MONGODB_URI if needed."