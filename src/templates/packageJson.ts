export function packageJsonTemplate(projectName: string) {
  return `{
    "name": "${projectName}",
    "version": "1.0.0",
    ...
  }`;
}
