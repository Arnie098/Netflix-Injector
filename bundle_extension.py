import os
import shutil
import zipfile

def bundle_extension():
    # Define source and destination
    source_dir = os.getcwd()
    dist_dir = os.path.join(source_dir, "dist")
    zip_name = "NetflixInjector_v1.2.zip"

    # Files and folders to include
    includes = [
        "manifest.json",
        "background.js",
        "content.js",
        "popup.html",
        "popup.js",
        "config.js",
        "icons"
    ]

    # Clean previous build
    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir)
    os.makedirs(dist_dir)

    print(f"📦 Bundling extension to '{dist_dir}'...")

    # Copy files
    for item in includes:
        src_path = os.path.join(source_dir, item)
        dst_path = os.path.join(dist_dir, item)
        
        if os.path.exists(src_path):
            if os.path.isdir(src_path):
                shutil.copytree(src_path, dst_path)
                print(f"  + Copied directory: {item}")
            else:
                shutil.copy2(src_path, dst_path)
                print(f"  + Copied file: {item}")
        else:
            print(f"  ⚠️ Warning: '{item}' not found!")

    # Create ZIP
    zip_path = os.path.join(source_dir, zip_name)
    print(f"\n🤐 Zipping to '{zip_name}'...")
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(dist_dir):
            for file in files:
                file_path = os.path.join(root, file)
                # Rel path in zip
                arcname = os.path.relpath(file_path, dist_dir)
                zipf.write(file_path, arcname)
                
    print(f"✅ Bundle complete! \n   Folder: {dist_dir}\n   Zip: {zip_path}")

if __name__ == "__main__":
    bundle_extension()
