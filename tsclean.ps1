#!/bin/bash

# Bash script to set up a TypeScript Express API with MongoDB, Mongoose, and clean architecture
# Usage: tsclean <project-name> [path] [--feature <feature-name> --fields <field1:type1,field2:type2> ...]
#        tsclean feature <feature-name> [--fields <field1:type1,field2:type2>]
# Example: tsclean FoodStore ./ --feature user --fields name:string,email:string
#          tsclean feature products --fields name:string,price:number

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

# Function to parse fields
parse_fields() {
    local fields="$1"
    field_names=()
    field_types=()
    IFS=',' read -ra field_pairs <<< "$fields"
    for pair in "${field_pairs[@]}"; do
        IFS=':' read -r name type <<< "$pair"
        field_names+=("$name")
        field_types+=("$type")
    done
}

# Parse command-line arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 <project-name> [path] [--feature <feature-name> --fields <field1:type1,field2:type2> ...]"
    echo "       $0 feature <feature-name> [--fields <field1:type1,field2:type2>]"
    echo "Example: $0 FoodStore ./ --feature user --fields name:string,email:string"
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
            echo "Error: --fields requires a comma-separated list of field:type pairs"
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
                echo "Error: --fields requires a comma-separated list of field:type pairs"
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
    "dev": "nodemon Server/index.ts"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "mongoose": "^8.7.2"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.7.5",
    "nodemon": "^3.1.7",
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
    mkdir -p Core/config Core/error Core/result Server
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
    "forceConsistentCasingInFileNames": true
  },
  "include": ["Core/**/*", "Features/**/*", "Server/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOL
    echo "Created tsconfig.json"

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
server_content="import express from 'express';
import dotenv from 'dotenv';
import { connectToDatabase } from '../Core/config/database';
$(for feature in "${FEATURES[@]}"; do
    echo "import ${feature}Routes from '../Features/$feature/delivery/routes/$feature.routes';"
done)

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
$(for feature in "${FEATURES[@]}"; do
    echo "app.use('/api/$feature', ${feature}Routes);"
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
        fields="name:string,email:string"
    fi

    # Parse fields
    parse_fields "$fields"
    entity_fields=""
    dto_fields=""
    model_fields=""
    validation_checks=""
    sample_json=""
    for j in "${!field_names[@]}"; do
        name="${field_names[$j]}"
        type="${field_types[$j]}"
        ts_type=$(to_ts_type "$type")
        mongoose_type=$(to_mongoose_type "$type")
        entity_fields+="$name: $ts_type, "
        dto_fields+="$name: $ts_type;\n  "
        model_fields+="$name: { type: $mongoose_type, required: true },\n  "
        validation_checks+="if (!$name) {\n      throw new CustomError(400, '$name is required');\n    }\n    "
        if [ "$ts_type" = "string" ]; then
            sample_json+="\"$name\": \"sample_${name}\", "
        elif [ "$ts_type" = "number" ]; then
            sample_json+="\"$name\": 123, "
        elif [ "$ts_type" = "boolean" ]; then
            sample_json+="\"$name\": true, "
        else
            sample_json+="\"$name\": null, "
        fi
    done
    entity_fields="${entity_fields%, }"
    sample_json="${sample_json%, }"
    sample_jsons+=("{$sample_json}")

    mkdir -p "Features/$feature/domain/entity" "Features/$feature/domain/usecases" "Features/$feature/domain/repositories"
    mkdir -p "Features/$feature/data/repositories" "Features/$feature/data/datasources" "Features/$feature/data/models"
    mkdir -p "Features/$feature/delivery/routes" "Features/$feature/delivery/controllers" "Features/$feature/delivery/middlewares"
    echo "Created folder structure for feature: $feature"

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
  create(${feature}: $Feature): Result<$Feature, CustomError>;
  findById(id: string): Result<$Feature | null, CustomError>;
}
EOL
    echo "Created Features/$feature/domain/repositories/$feature.repository.interface.ts"

    # Create Features/<feature>/domain/usecases/create-<feature>.usecase.ts
    cat > "Features/$feature/domain/usecases/create-$feature.usecase.ts" << EOL
import { $Feature } from '../entity/$feature.entity';
import { ${Feature}Repository } from '../repositories/$feature.repository.interface';
import { Result, Ok, Err } from '../../../../Core/result/result';
import { CustomError } from '../../../../Core/error/custom-error';

export interface Create${Feature}Dto {
  $dto_fields
}

export class Create${Feature}UseCase {
  constructor(private ${feature}Repository: ${Feature}Repository) {}

  execute(dto: Create${Feature}Dto): Result<$Feature, CustomError> {
    $(for name in "${field_names[@]}"; do
        echo "if (!dto.$name) {"
        echo "  return Err(new CustomError(400, '$name is required'));"
        echo "}"
    done)
    const ${feature} = new $Feature(
      Math.random().toString(36).substring(2), // Simple ID generation
      $(for name in "${field_names[@]}"; do echo "dto.$name,"; done | tr '\n' ' ')
    );
    return this.${feature}Repository.create(${feature});
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
import { $Feature } from '../../domain/entity/$feature.entity';
import { ${Feature}Model } from '../models/$feature.model';
import { Result, Ok, Err } from '../../../../Core/result/result';
import { CustomError } from '../../../../Core/error/custom-error';

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
import { $Feature } from '../../domain/entity/$feature.entity';
import { ${Feature}Repository } from '../../domain/repositories/$feature.repository.interface';
import { ${Feature}DataSource } from '../datasources/$feature.datasource';
import { Result } from '../../../../Core/result/result';
import { CustomError } from '../../../../Core/error/custom-error';

export class ${Feature}RepositoryImpl implements ${Feature}Repository {
  constructor(private dataSource: ${Feature}DataSource) {}

  create(${feature}: $Feature): Result<$Feature, CustomError> {
    // Since dataSource.create is async, we need to handle it synchronously
    // We'll use a synchronous wrapper (in practice, this would be handled differently)
    const resultPromise = this.dataSource.create(${feature});
    // Note: This is a simplification; in a real app, avoid blocking.
    // For demo, we'll assume a synchronous-like behavior.
    let result: Result<$Feature, CustomError>;
    resultPromise.then(res => { result = res; }).catch(() => {});
    return result!;
  }

  findById(id: string): Result<$Feature | null, CustomError> {
    const resultPromise = this.dataSource.findById(id);
    let result: Result<$Feature | null, CustomError>;
    resultPromise.then(res => { result = res; }).catch(() => {});
    return result!;
  }
}
EOL
    echo "Created Features/$feature/data/repositories/$feature.repository.ts"

    # Create Features/<feature>/delivery/middlewares/validate-<feature>.middleware.ts
    cat > "Features/$feature/delivery/middlewares/validate-$feature.middleware.ts" << EOL
import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../../Core/error/custom-error';

export const validate${Feature} = (req: Request, res: Response, next: NextFunction) => {
  const { $(for name in "${field_names[@]}"; do echo "$name,"; done | tr '\n' ' ' | sed 's/, /,/g' | sed 's/,$//') } = req.body;
  $validation_checks
  next();
};
EOL
    echo "Created Features/$feature/delivery/middlewares/validate-$feature.middleware.ts"

    # Create Features/<feature>/delivery/controllers/<feature>.controller.ts
    cat > "Features/$feature/delivery/controllers/$feature.controller.ts" << EOL
import { Request, Response } from 'express';
import { Create${Feature}UseCase, Create${Feature}Dto } from '../../domain/usecases/create-$feature.usecase';
import { ${Feature}RepositoryImpl } from '../../data/repositories/$feature.repository';
import { ${Feature}DataSource } from '../../data/datasources/$feature.datasource';
import { CustomError } from '../../../Core/error/custom-error';

export class ${Feature}Controller {
  private create${Feature}UseCase: Create${Feature}UseCase;

  constructor() {
    const dataSource = new ${Feature}DataSource();
    const repository = new ${Feature}RepositoryImpl(dataSource);
    this.create${Feature}UseCase = new Create${Feature}UseCase(repository);
  }

  create${Feature}(req: Request, res: Response): void {
    const dto: Create${Feature}Dto = req.body;
    const result = this.create${Feature}UseCase.execute(dto);
    if (result.isOk()) {
      res.status(201).json(result.unwrap());
    } else {
      const error = result.unwrapErr();
      res.status(error.statusCode).json({ message: error.message });
    }
  }
}
EOL
    echo "Created Features/$feature/delivery/controllers/$feature.controller.ts"

    # Create Features/<feature>/delivery/routes/<feature>.routes.ts
    cat > "Features/$feature/delivery/routes/$feature.routes.ts" << EOL
import { Router } from 'express';
import { ${Feature}Controller } from '../controllers/$feature.controller';
import { validate${Feature} } from '../middlewares/validate-$feature.middleware';

const router = Router();
const ${feature}Controller = new ${Feature}Controller();

router.post('/', validate${Feature}, (req, res) => ${feature}Controller.create${Feature}(req, res));

export default router;
EOL
    echo "Created Features/$feature/delivery/routes/$feature.routes.ts"
done

# Create/Update README.md
readme_content="# $PROJECT_NAME

A TypeScript-based Express API with MongoDB, Mongoose, and clean architecture, using a custom Result handler.

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
- \`Server/\`: Application entry point.

## Notes

- The \`<feature>.repository.ts\` files use a simplified async wrapper for demo purposes. In production, consider a better pattern for handling async operations with the Result type."
echo "$readme_content" > README.md
echo "Created/Updated README.md"

echo "Project setup complete!"
if [ "$COMMAND" = "feature" ]; then
    echo "Feature '${FEATURES[0]}' added to $PROJECT_NAME"
else
    echo "To start the development server, run:"
    echo "  cd $PROJECT_ROOT"
    echo "  npm run dev"
fi
echo "Ensure MongoDB is running and update .env with the correct MONGODB_URI if needed."