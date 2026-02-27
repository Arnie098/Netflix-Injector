import os
import json
import shutil
import subprocess

# Configuration
VERSION = "1.2.1"
DIST_DIR = f"NetflixInjector_v{VERSION}_RELEASE"
MANIFEST_FILE = "manifest.json"

def clean_dist():
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    os.makedirs(DIST_DIR)
    print(f"Created {DIST_DIR}")

def get_essential_files():
    with open(MANIFEST_FILE, 'r') as f:
        manifest = json.load(f)
    
    files = set([MANIFEST_FILE])
    
    # Background
    if 'background' in manifest and 'service_worker' in manifest['background']:
        files.add(manifest['background']['service_worker'])
        
    # Content Scripts
    if 'content_scripts' in manifest:
        for script in manifest['content_scripts']:
            if 'js' in script:
                files.update(script['js'])
            if 'css' in script:
                files.update(script['css'])
                
    # Action/Popup
    if 'action' in manifest:
        if 'default_popup' in manifest['action']:
            files.add(manifest['action']['default_popup'])
        if 'default_icon' in manifest['action']:
            if isinstance(manifest['action']['default_icon'], dict):
                files.update(manifest['action']['default_icon'].values())
            else:
                files.add(manifest['action']['default_icon'])
                
    # Icons
    if 'icons' in manifest:
        files.update(manifest['icons'].values())
        
    # Config and Popup Logic
    if os.path.exists("config.js"):
        files.add("config.js")

    if 'action' in manifest and 'default_popup' in manifest['action']:
         popup_html = manifest['action']['default_popup']
         base = os.path.splitext(popup_html)[0]
         if os.path.exists(f"{base}.js"):
             files.add(f"{base}.js")
         if os.path.exists(f"{base}.css"):
             files.add(f"{base}.css")

    # RECURSIVE CORE: Include all JS in core/ to handle dynamic imports (like monitor.js)
    if os.path.exists("core"):
        for root, dirs, filenames in os.walk("core"):
            for filename in filenames:
                if filename.endswith(".js"):
                    # Normalize path separators to forward slash for consistency
                    rel_path = os.path.join(root, filename).replace("\\", "/")
                    files.add(rel_path)

    return list(files)

def copy_and_obfuscate(files):
    for file_path in files:
        src = file_path
        dst = os.path.join(DIST_DIR, file_path)
        
        # Create subdirs if needed
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        
        if file_path.endswith('.js'):
            print(f"Obfuscating {file_path}...")
            try:
                # Using npx javascript-obfuscator
                cmd = [
                    "npx", "-y", "javascript-obfuscator", src,
                    "--output", dst,
                    "--compact", "true",
                    "--control-flow-flattening", "true"
                ]
                subprocess.run(cmd, shell=True, check=True, stderr=subprocess.PIPE)
            except subprocess.CalledProcessError as e:
                print(f"  Obfuscation failed for {file_path}, falling back to copy. Error: {e}")
                shutil.copy2(src, dst)
        else:
            print(f"Copying {file_path}...")
            shutil.copy2(src, dst)

def create_zip():
    shutil.make_archive(DIST_DIR, 'zip', DIST_DIR)
    print(f"Created {DIST_DIR}.zip")

def main():
    print(f"Building Release v{VERSION}...")
    clean_dist()
    files = get_essential_files()
    print(f"Found {len(files)} essential files.")
    copy_and_obfuscate(files)
    create_zip()
    print("Build Complete.")

if __name__ == "__main__":
    main()
