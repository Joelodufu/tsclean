import { parseArgs } from "./utils/argParser";
import { createProject } from "./commands/createProject";
import { addFeature } from "./commands/addFeature";

const args = parseArgs(process.argv.slice(2));

if (args.command === "feature") {
  addFeature(args);
} else {
  createProject(args);
}
