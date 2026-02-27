import os
import json
import shutil
import subprocess

# Configuration
VERSION = "1.2"
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
    
    files = [MANIFEST_FILE]
    
    # Background
    if 'background' in manifest and 'service_worker' in manifest['background']:
        files.append(manifest['background']['service_worker'])
        
    # Content Scripts
    if 'content_scripts' in manifest:
        for script in manifest['content_scripts']:
            if 'js' in script:
                files.extend(script['js'])
            if 'css' in script:
                files.extend(script['css'])
                
    # Action/Popup
    if 'action' in manifest:
        if 'default_popup' in manifest['action']:
            files.append(manifest['action']['default_popup'])
        if 'default_icon' in manifest['action']:
            if isinstance(manifest['action']['default_icon'], dict):
                files.extend(manifest['action']['default_icon'].values())
            else:
                files.append(manifest['action']['default_icon'])
                
    # Icons
    if 'icons' in manifest:
        files.extend(manifest['icons'].values())
        
    # Add config.js if it exists and is likely used (often injected or imported)
    if os.path.exists("config.js"):
        files.append("config.js")

    # Add popup.js if popup.html exists (manifest only points to html)
    if 'action' in manifest and 'default_popup' in manifest['action']:
         popup_html = manifest['action']['default_popup']
         # Simple assumption: popup.js is in same dir
         base = os.path.splitext(popup_html)[0]
         if os.path.exists(f"{base}.js"):
             files.append(f"{base}.js")
         if os.path.exists(f"{base}.css"):
             files.append(f"{base}.css")

    return list(set(files)) # Dedup

def copy_and_obfuscate(files):
    for file_path in files:
        src = file_path
        dst = os.path.join(DIST_DIR, file_path)
        
        # Create subdirs if needed
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        
        if file_path.endswith('.js'):
            print(f"Obfuscating {file_path}...")
            # Try obfuscation
            try:
                # We expect npx to be available. 
                # If javascript-obfuscator is not installed globally or locally, npx might ask to install or fail.
                # We will try to run it.
                cmd = [
                    "npx", "-y", "javascript-obfuscator", src,
                    "--output", dst,
                    "--compact", "true",
                    "--control-flow-flattening", "true"
                ]
                # Windows shell=True might be needed for npx
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
    print(f"Found {len(files)} essential files: {files}")
    copy_and_obfuscate(files)
    create_zip()
    print("Build Complete.")

if __name__ == "__main__":
    main()
