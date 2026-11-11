const FileUtils = require("./utils/file-utils");
const path = require("path");
const fs = require("fs/promises");

class DemoCopier {
  async copyDemoFiles() {
    console.log("Starting website files copy...");

    const projectRoot = path.resolve(__dirname, "../");

    // Copy index.html
    const indexSourcePath = path.join(projectRoot, "index.html");
    const indexDestPath = path.join(projectRoot, "dist", "index.html");
    await FileUtils.copyFile(indexSourcePath, indexDestPath);
    await FileUtils.copyFile(
      path.join(projectRoot, "404.html"),
      path.join(projectRoot, "dist", "404.html"),
    );

    // Ship the attribution and license notices with the served dataset.
    for (const name of [
      "LICENSE",
      "LICENSE-DATA",
      "ATTRIBUTION.md",
      "NOTICE-SOURCES.txt",
      "NOTICE-Unicode-3.0.txt",
      "NOTICE-flag-icons.txt",
    ]) {
      await FileUtils.copyFile(
        path.join(projectRoot, name),
        path.join(projectRoot, "dist", name),
      );
    }
    // Copy the playground page and its assets.
    const playgroundSourceDir = path.join(projectRoot, "playground");
    const playgroundDestDir = path.join(projectRoot, "dist", "playground");

    // Use FileUtils.copyDir to ensure proper copying without hard links
    if (await FileUtils.pathExists(playgroundSourceDir)) {
      await FileUtils.copyDir(playgroundSourceDir, playgroundDestDir);
      console.log(`✓ Copied: playground -> ${playgroundDestDir}`);
    } else {
      console.warn(
        `⚠ Source playground folder not found: ${playgroundSourceDir}`,
      );
    }

    // Publish the website documentation, while leaving the Markdown sources
    // and other project documentation out of the deployed site.
    const docsSourceDir = path.join(projectRoot, "docs");
    if (await FileUtils.pathExists(docsSourceDir)) {
      const entries = await fs.readdir(docsSourceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && /\.(html|css|js)$/.test(entry.name)) {
          await FileUtils.copyFile(
            path.join(docsSourceDir, entry.name),
            path.join(projectRoot, "dist", "docs", entry.name),
          );
        }
      }
      console.log("✓ Copied: website documentation -> dist/docs");
    }

    console.log("✅ Website files copy completed successfully!");
  }

  async run() {
    try {
      console.log("🚀 Geo-Data API - Website Copier");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Copy website files
      await this.copyDemoFiles();

      console.log("================================================");
      console.log("✅ Copy completed successfully!");
      console.log("");
      console.log("Copied files:");
      console.log("• Index HTML (dist/index.html)");
      console.log("• Not-found page (dist/404.html)");
      console.log("• Playground files (dist/playground/)");
      console.log("• Website documentation (dist/docs/)");

      // Force exit the process cleanly
      process.exit(0);
    } catch (error) {
      console.error("❌ Fatal error:", error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }
}

const copier = new DemoCopier();
copier.run();
