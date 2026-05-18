const { execSync } = require("child_process");

exports.default = async function afterPack(context) {
  if (process.platform !== "darwin") return;
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: "ignore" });
    execSync(`dot_clean "${appPath}"`, { stdio: "ignore" });
    execSync(`find "${appPath}" -name '._*' -delete`, { stdio: "ignore" });
  } catch {}
};
