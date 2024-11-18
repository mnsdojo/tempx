import { red } from "picocolors";
import { blue } from "picocolors";
import { $ } from "bun";
import { existsSync } from "fs";
import path from "path";

export async function detectPackageManager(directory: string): Promise<string> {
  if (existsSync(path.join(directory, "package-lock.json"))) return "npm";
  if (existsSync(path.join(directory, "yarn.lock"))) return "npm";
  if (existsSync(path.join(directory, "pnpm-lock.yaml"))) return "npm";
  if (existsSync(path.join(directory, "bun.lockb"))) return "npm";

  return "bun";
}

export async function cloneRepository(
  url: string,
  targetDir: string
): Promise<boolean> {
  try {
    console.log(blue(`Cloning repository to ${targetDir}...`));
    await $`git clone ${url} ${targetDir}`;
    return true;
  } catch (error) {
    console.error(red(`Error cloning repository: ${(error as Error).message}`));
    return false;
  }
}

export async function installDependencies(directory: string): Promise<boolean> {
  try {
    const packageManager = await detectPackageManager(directory);
    console.log(blue(`Installing dependencies using ${packageManager}...`));
    switch (packageManager) {
      case "npm":
        await $`cd ${directory} && npm install`;
        break;
      case "pnpm":
        await $`cd ${directory} && pnpm install`;
        break;
      case "yarn":
        await $`cd ${directory} && yarn install`;
        break;
      case "bun":
        await $`cd ${directory} && bun install`;
        break;
    }
    return true;
  } catch (error) {
    console.error(
      red(`Error installing dependencies: ${(error as Error).message}`)
    );
    return false;
  }
}
