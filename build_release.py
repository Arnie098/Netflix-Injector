import os
import shutil
import subprocess
import zipfile
import json

def build_release():
    # 1. Configuration
    VERSION = "1.1"
    RELEASE_NAME = f"NetflixInjector_v{VERSION}_RELEASE.zip"
    DIST_DIR = "dist"
    
    # Files to copy directly (non-obfuscated)
    STATIC_FILES = [
        "manifest.json",
        "popup.html",
    ]
    
    # Root JS files to obfuscate
    ROOT_JS = [
        "background.js",
        "popup.js",
        "config.js",
        "content.js",
    ]
    
    # 2. Clean/Create dist
    print(f"🧹 Cleaning '{DIST_DIR}'...")
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    os.makedirs(DIST_DIR)
    
    # 3. Copy Icons
    print("🖼️ Copying icons...")
    if os.path.exists("icons"):
        shutil.copytree("icons", os.path.join(DIST_DIR, "icons"))
    
    # 4. Copy and Obfuscate Core Library
    print("📦 Processing core library...")
    if os.path.exists("core"):
        # We walk through the core directory to mirror its structure and obfuscate JS
        for root, dirs, files in os.walk("core"):
            # Create corresponding directory in dist
            relative_path = os.path.relpath(root, ".")
            dist_parent = os.path.join(DIST_DIR, relative_path)
            os.makedirs(dist_parent, exist_ok=True)
            
            for file in files:
                src_file = os.path.join(root, file)
                dest_file = os.path.join(dist_parent, file)
                
                if file.endswith(".js"):
                    obfuscate_file(src_file, dest_file)
                else:
                    shutil.copy(src_file, dest_file)
    
    # 5. Copy Static Meta Files
    print("📄 Copying static files...")
    for file in STATIC_FILES:
        if os.path.exists(file):
            shutil.copy(file, os.path.join(DIST_DIR, file))
            
    # 6. Obfuscate Root JS
    print("🔒 Obfuscating root JS files...")
    for js in ROOT_JS:
        if os.path.exists(js):
            dest = os.path.join(DIST_DIR, js)
            obfuscate_file(js, dest)

    # 7. Final Polish: Minify Manifest (Remove any comments if any, though JSON doesn't have them)
    manifest_path = os.path.join(DIST_DIR, "manifest.json")
    if os.path.exists(manifest_path):
        with open(manifest_path, 'r') as f:
            data = json.load(f)
        with open(manifest_path, 'w') as f:
            json.dump(data, f, separators=(',', ':'))

    # 8. Zip
    print(f"🤐 Packaging into {RELEASE_NAME}...")
    with zipfile.ZipFile(RELEASE_NAME, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(DIST_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, DIST_DIR)
                zipf.write(file_path, arcname)

    print(f"\n✅ Build Successful!")
    print(f"📂 Release: {os.path.abspath(RELEASE_NAME)}")

def obfuscate_file(src, dest):
    """Run javascript-obfuscator on a file with CSP-safe settings."""
    print(f"   - {src} -> {dest}")
    
    # javascript-obfuscator command
    # Settings derived from OBFUSCATION_PLAN.md for Manifest V3 safety
    cmd = [
        "npx", "--yes", "javascript-obfuscator", src,
        "--output", dest,
        "--target", "browser-no-eval",
        "--compact", "true",
        "--control-flow-flattening", "true",
        "--control-flow-flattening-threshold", "0.75",
        "--dead-code-injection", "true",
        "--dead-code-injection-threshold", "0.4",
        "--string-array", "true",
        "--string-array-rotate", "true",
        "--string-array-shuffle", "true",
        "--string-array-threshold", "0.75",
        "--split-strings", "true",
        "--split-strings-chunk-length", "10",
        "--unicode-escape-sequence", "false", # Keep it readable for debug if needed, but safe
        "--rename-globals", "false", # Don't break extension entry points
    ]
    
    try:
        subprocess.run(cmd, check=True, capture_output=True, shell=True)
    except subprocess.CalledProcessError as e:
        print(f"   ⚠️ Obfuscation failed for {src}: {e.stderr.decode()}")
        print(f"   Fallback: Copying original {src}")
        shutil.copy(src, dest)

if __name__ == "__main__":
    build_release()
