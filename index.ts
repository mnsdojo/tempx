#!/usr/bin/env bun
import { Octokit } from "@octokit/rest";
import { $ } from "bun";
import { Command } from "commander";
import { mkdir, rmdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { blue, green, red, yellow } from "picocolors";
import inquirer from "inquirer";

// === Type Definitions ===
/**
 * Configuration structure for the CLI
 */
interface Config {
  username: string; // GitHub username
  defaultBranch: string; // Default branch for repositories
  installCommand: string; // Command used to install dependencies
}

/**
 * Command line options interface
 */
interface CommandOptions {
  install?: boolean; // Flag to install dependencies
  username?: string; // GitHub username option
}

/**
 * Structure for template information
 */
interface TemplateInfo {
  cloneUrl: string; // GitHub clone URL
  updatedAt: string; // Last update timestamp
}

// Type alias for template collection
type Templates = Record<string, TemplateInfo>;

// === Constants ===
const octokit = new Octokit();
const program = new Command();
const CONFIG_FILE = ".tempx.json";
const DEFAULT_CONFIG: Config = {
  username: "your_name",
  defaultBranch: "main",
  installCommand: "bun install",
};

// === Configuration Management ===
/**
 * Loads configuration from file or returns default config
 * @returns Promise<Config> Configuration object
 */
async function loadConfig(): Promise<Config> {
  try {
    if (existsSync(CONFIG_FILE)) {
      const config = await Bun.file(CONFIG_FILE).json();
      return { ...DEFAULT_CONFIG, ...config };
    }
    return DEFAULT_CONFIG;
  } catch (error: any) {
    console.error(red(`Error loading config: ${error.message}`));
    return DEFAULT_CONFIG;
  }
}

/**
 * Saves configuration to file
 * @param config Configuration object to save
 */
async function saveConfig(config: Config): Promise<void> {
  try {
    await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error(red(`Error saving config: ${(error as Error).message}`));
  }
}

/**
 * Handles interactive configuration setup
 */
async function configureInteractive(): Promise<void> {
  const config = await loadConfig();

  // Prompt user for configuration values
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "username",
      message: "Enter your GitHub username:",
      default: config.username,
    },
    {
      type: "input",
      name: "defaultBranch",
      message: "Enter your default branch name:",
      default: config.defaultBranch,
    },
    {
      type: "input",
      name: "installCommand",
      message: "Enter your install command:",
      default: config.installCommand,
    },
  ]);

  await saveConfig({ ...config, ...answers });
  console.log(green("Configuration updated successfully!"));
}

// === Template Management ===
/**
 * Fetches template repositories from GitHub
 * @param username GitHub username
 * @returns Promise<Templates> Collection of template repositories
 */
async function loadTemplates(username: string): Promise<Templates> {
  try {
    // Fetch user's repositories from GitHub
    const { data: repositories } = await octokit.repos.listForUser({
      username,
      type: "all",
      per_page: 100,
    });

    // Filter and transform repositories into templates
    const templates = repositories
      .filter(
        (repo): repo is typeof repo & { is_template: true } =>
          !!repo.is_template
      )
      .reduce<Templates>((acc, repo) => {
        acc[repo.name] = {
          cloneUrl: repo.clone_url || "",
          updatedAt: repo.updated_at || "",
        };
        return acc;
      }, {});

    if (Object.keys(templates).length === 0) {
      console.log(yellow("No templates found for the specified user."));
    }
    return templates;
  } catch (error: any) {
    console.error(red(`Error loading templates: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Prompts user to select a template
 * @param templates Available templates
 * @returns Promise<string> Selected template name
 */
async function selectTemplate(templates: Templates): Promise<string> {
  const choices = Object.entries(templates).map(([name, info]) => ({ name: `${name} (Last updated: ${new Date(
      info.updatedAt
    ).toLocaleDateString()})`,
    value: name,
  }));

  const { templateName } = await inquirer.prompt([
    {
      type: "list",
      name: "templateName",
      message: "Select a template:",
      choices,
    },
  ]);
  return templateName;
}

// === Repository Operations ===
/**
 * Clones a repository to the specified directory
 * @param url Repository URL
 * @param targetDir Target directory
 * @returns Promise<boolean> Success status
 */
async function cloneRepository(
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

/**
 * Installs dependencies in the specified directory
 * @param directory Target directory
 * @returns Promise<boolean> Success status
 */
async function installDependencies(directory: string): Promise<boolean> {
  try {
    console.log(blue("Installing dependencies..."));
    await $`cd ${directory} && bun install`;
    return true;
  } catch (error) {
    console.error(
      red(`Error installing dependencies: ${(error as Error).message}`)
    );
    return false;
  }
}

/**
 * Handles post-clone actions like installing dependencies or opening VS Code
 * @param directory Target directory
 */
async function postCloneActions(directory: string): Promise<void> {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do next?",
      choices: [
        { name: "Install dependencies", value: "install" },
        { name: "Open in VS Code", value: "code" },
        { name: "Nothing", value: "nothing" },
      ],
    },
  ]);

  switch (action) {
    case "install":
      await installDependencies(directory);
      break;
    case "code":
      try {
        await $`code ${directory}`;
      } catch (error) {
        console.error(red("Failed to open VS Code"));
      }
      break;
  }
}

// === Main Command Handler ===
/**
 * Main handler for template operations (view/use)
 */
async function handleTemplates(): Promise<void> {
  const config = await loadConfig();
  const templates = await loadTemplates(config.username);

  if (Object.keys(templates).length === 0) return;

  // Get user's intended action
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { name: "View template details", value: "view" },
        { name: "Use a template", value: "use" },
        { name: "Cancel", value: "cancel" },
      ],
    },
  ]);

  if (action === "cancel") return;

  // Template selection
  const templateName = await selectTemplate(templates);

  // Handle view action
  if (action === "view") {
    console.log(blue("\nTemplate Details:"));
    console.log(green(`\nName: ${templateName}`));
    console.log(
      `Last Updated: ${new Date(
        templates[templateName].updatedAt
      ).toLocaleDateString()}`
    );
    console.log(`Clone URL: ${templates[templateName].cloneUrl}\n`);

    const { useTemplate } = await inquirer.prompt([
      {
        type: "confirm",
        name: "useTemplate",
        message: "Would you like to use this template?",
        default: false,
      },
    ]);

    if (!useTemplate) return;
  }

  // Get target directory
  const { targetDir } = await inquirer.prompt([
    {
      type: "input",
      name: "targetDir",
      message: "Enter target directory:",
      default: templateName,
    },
  ]);

  // Handle directory creation and cleanup
  const resolvedDir = resolve(targetDir);
  await mkdir(dirname(resolvedDir), { recursive: true });

  if (existsSync(resolvedDir)) {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Directory ${resolvedDir} exists. Remove it?`,
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(yellow("Operation cancelled."));
      return;
    }
    await rmdir(resolvedDir, { recursive: true });
  }

  // Clone and setup template
  const cloneSuccess = await cloneRepository(
    templates[templateName].cloneUrl,
    resolvedDir
  );

  if (cloneSuccess) {
    console.log(green(`Template ${templateName} cloned successfully!`));
    await postCloneActions(resolvedDir);
  }
}

// === CLI Command Setup ===
program
  .name("tempx")
  .description("Manage GitHub template repositories with Bun")
  .version("1.0.0");

// Configuration command
program
  .command("config")
  .description("Configure settings interactively")
  .option("-u, --username <username>", "Set GitHub username")
  .action(async (options: CommandOptions) => {
    if (options.username) {
      const config = await loadConfig();
      config.username = options.username;
      await saveConfig(config);
      console.log(green(`GitHub username set to: ${options.username}`));
    } else {
      await configureInteractive();
    }
  });

// Templates command
program
  .command("templates")
  .description("List and use templates interactively")
  .action(handleTemplates);

// Install command
program
  .command("install <directory>")
  .description("Install dependencies for the template")
  .action(async (dir: string) => {
    const targetDir = resolve(dir);
    if (!existsSync(targetDir)) {
      console.error(red(`Directory ${targetDir} does not exist.`));
      process.exit(1);
    }

    const success = await installDependencies(targetDir);
    if (success) {
      console.log(green("Dependencies installed successfully!"));
    }
  });

// Parse command line arguments
program.parse(process.argv);
