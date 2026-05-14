import os
import shutil
import zipfile
import subprocess

VERSION = "1.3.0"
DIST_DIR = f"NetflixInjector_v{VERSION}_RELEASE"
ZIP_NAME = f"NetflixInjector_v{VERSION}_RELEASE.zip"

# Only extension files needed for Chrome to load it
ESSENTIAL_FILES = [
    "manifest.json",
    "background.js",
    "content.js",
    "popup.js",
    "popup.html",
    "config.js",
]

ESSENTIAL_FOLDERS = [
    "icons",
    "core",
]


def build_release():
    print(f"--- Building NetflixInjector v{VERSION} ---\n")

    # 1. Clean
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    os.makedirs(DIST_DIR)

    # 2. Copy files
    for item in ESSENTIAL_FILES:
        src = item
        dst = os.path.join(DIST_DIR, item)
        if os.path.isfile(src):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
            print(f"  ✓ {item}")
        else:
            print(f"  ⚠ Missing: {item}")

    # 3. Copy folders
    for folder in ESSENTIAL_FOLDERS:
        src = folder
        dst = os.path.join(DIST_DIR, folder)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
            print(f"  ✓ {folder}/")
        else:
            print(f"  ⚠ Missing folder: {folder}")

    # 4. Obfuscate all JS files
    print("\n🔒 Obfuscating JavaScript...")
    obfuscator = r"C:\Users\Admin\AppData\Roaming\npm\javascript-obfuscator.cmd"
    if not os.path.exists(obfuscator):
        obfuscator = "javascript-obfuscator"

    js_count = 0
    for root, dirs, files in os.walk(DIST_DIR):
        for file in files:
            if file.endswith(".js"):
                file_path = os.path.join(root, file)
                rel = os.path.relpath(file_path, DIST_DIR)
                cmd = [
                    obfuscator,
                    file_path,
                    "--output", file_path,
                    "--target", "browser-no-eval",
                    "--compact", "true",
                    "--control-flow-flattening", "true",
                    "--control-flow-flattening-threshold", "0.5",
                    "--dead-code-injection", "true",
                    "--dead-code-injection-threshold", "0.2",
                    "--string-array", "true",
                    "--string-array-rotate", "true",
                    "--string-array-shuffle", "true",
                    "--string-array-encoding", "base64",
                    "--string-array-threshold", "0.7",
                    "--rename-globals", "false",
                    "--self-defending", "false",
                    "--split-strings", "true",
                    "--split-strings-chunk-length", "5",
                ]
                try:
                    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                    if result.returncode == 0:
                        print(f"  🔒 {rel}")
                        js_count += 1
                    else:
                        print(f"  ❌ {rel}: {result.stderr[:100]}")
                except Exception as e:
                    print(f"  ❌ {rel}: {e}")

    print(f"\n  Obfuscated {js_count} files")

    # 5. Create ZIP
    print(f"\n📦 Creating {ZIP_NAME}...")
    if os.path.exists(ZIP_NAME):
        os.remove(ZIP_NAME)

    with zipfile.ZipFile(ZIP_NAME, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(DIST_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, ".")
                zipf.write(file_path, arcname)

    # Get zip size
    zip_size = os.path.getsize(ZIP_NAME) / 1024
    print(f"\n{'='*50}")
    print(f"✅ NetflixInjector v{VERSION} Release Built!")
    print(f"   Folder: {DIST_DIR}/")
    print(f"   Archive: {ZIP_NAME} ({zip_size:.1f} KB)")
    print(f"{'='*50}")


if __name__ == "__main__":
    build_release()
