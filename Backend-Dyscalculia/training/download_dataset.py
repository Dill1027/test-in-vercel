import kagglehub

path = kagglehub.dataset_download(
    "olafkrastovski/handwritten-digits-0-9"
)

print("Dataset downloaded to:", path)
