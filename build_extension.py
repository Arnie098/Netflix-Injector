import os
import shutil
import subprocess
import zipfile

def build():
    # 1. Clean/Create dist
    if os.path.exists("dist"):
        shutil.rmtree("dist")
    os.makedirs("dist")
    os.makedirs("dist/icons", exist_ok=True)

    print("📁 Created dist directory")

    # 2. Copy static files
    shutil.copy("manifest.json", "dist/manifest.json")
    shutil.copy("popup.html", "dist/popup.html")
    # Copy icons
    if os.path.exists("icons"):
        for icon in os.listdir("icons"):
            shutil.copy(os.path.join("icons", icon), os.path.join("dist/icons", icon))

    print("📄 Copied static files")

    # 3. Obfuscate JS
    js_files = ["background.js", "popup.js", "config.js"]
    if os.path.exists("content.js"):
        js_files.append("content.js")

    for js in js_files:
        print(f"🔒 Obfuscating {js}...")
        try:
            subprocess.run(
                ["npx", "--yes", "javascript-obfuscator", js, "--output", f"dist/{js}", "--compact", "true", "--self-defending", "true"],
                check=True,
                shell=True
            )
        except subprocess.CalledProcessError:
            print(f"⚠️ Failed to obfuscate {js}, using original.")
            shutil.copy(js, f"dist/{js}")

    # 4. Zip
    zip_name = "NetflixInjector_v2.0_OBFUSCATED.zip"
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk("dist"):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, "dist")
                zipf.write(file_path, arcname)

    print(f"✅ Build Complete: {zip_name}")

if __name__ == "__main__":
    build()
