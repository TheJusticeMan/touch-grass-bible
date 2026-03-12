import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";

const platformName = process.env.CAPACITOR_PLATFORM_NAME;

if (platformName && platformName !== "android") {
  process.exit(0);
}

const rootDir = process.env.CAPACITOR_ROOT_DIR || process.cwd();
const valuesV35StylesPath = join(rootDir, "android", "app", "src", "main", "res", "values-v35", "styles.xml");

const valuesV35Styles = `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>
    </style>
</resources>
`;

await mkdir(dirname(valuesV35StylesPath), { recursive: true });
await writeFile(valuesV35StylesPath, valuesV35Styles, "utf8");

console.log(`Applied Android edge-to-edge override at ${valuesV35StylesPath}`);
