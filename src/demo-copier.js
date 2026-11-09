const FileUtils = require("./utils/file-utils");
const path = require("path");
const fs = require("fs/promises");

class DemoCopier {
  async copyDemoFiles() {
    console.log("Starting demo files copy...");

    const projectRoot = path.resolve(__dirname, "../");

    // Copy index.html
    const indexSourcePath = path.join(projectRoot, "index.html");
    const indexDestPath = path.join(projectRoot, "dist", "index.html");
    await FileUtils.copyFile(indexSourcePath, indexDestPath);
    await FileUtils.copyFile(
      path.join(projectRoot, "_headers"),
      path.join(projectRoot, "dist", "_headers"),
    );

    // Copy entire demo folder (if present) into dist/demo
    const demoSourceDir = path.join(projectRoot, "demo");
    const demoDestDir = path.join(projectRoot, "dist", "demo");

    // Use FileUtils.copyDir to ensure proper copying without hard links
    if (await FileUtils.pathExists(demoSourceDir)) {
      await FileUtils.copyDir(demoSourceDir, demoDestDir);
      console.log(`✓ Copied: demo -> ${demoDestDir}`);
    } else {
      console.warn(`⚠ Source demo folder not found: ${demoSourceDir}`);
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

    console.log("✅ Demo files copy completed successfully!");
  }

  async run() {
    try {
      console.log("🚀 Geo-Data API - Demo Copier");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Copy demo files
      await this.copyDemoFiles();

      console.log("================================================");
      console.log("✅ Copy completed successfully!");
      console.log("");
      console.log("Copied files:");
      console.log("• Index HTML (dist/index.html)");
      console.log("• Demo files (dist/demo/)");
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
