import os
import zipfile

def zip_dist_folder():
    source_dir = os.getcwd()
    dist_dir = os.path.join(source_dir, "dist")
    zip_name = "NetflixInjector_v1.2_OBFUSCATED.zip"
    zip_path = os.path.join(source_dir, zip_name)

    print(f"🤐 Zipping obfuscated 'dist' to '{zip_name}'...")
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(dist_dir):
            for file in files:
                file_path = os.path.join(root, file)
                # Rel path in zip
                arcname = os.path.relpath(file_path, dist_dir)
                zipf.write(file_path, arcname)
                
    print(f"✅ Zip complete!\n   Zip: {zip_path}")

if __name__ == "__main__":
    zip_dist_folder()
