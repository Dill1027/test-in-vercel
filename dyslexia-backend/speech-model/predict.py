import tensorflow as tf
import librosa
import numpy as np
import pickle
import os
import subprocess
import tempfile


# ===============================
# Load Model and Encoder
# ===============================

MODEL_PATH = "sinhala_cnn_model.keras"
ENCODER_PATH = "label_encoder.pkl"


model = tf.keras.models.load_model(MODEL_PATH)


with open(ENCODER_PATH, "rb") as f:
    encoder = pickle.load(f)



# ===============================
# Convert Any Audio to WAV
# ===============================

def convert_to_wav(audio_path):

    # already wav
    if audio_path.lower().endswith(".wav"):
        return audio_path


    wav_path = tempfile.mktemp(
        suffix=".wav"
    )


    command = [
        "ffmpeg",
        "-y",
        "-i",
        audio_path,
        "-ar",
        "16000",
        "-ac",
        "1",
        wav_path
    ]


    subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )


    return wav_path



# ===============================
# MFCC Feature Extraction
# SAME AS TRAINING
# ===============================

def extract_mfcc(audio_path, max_pad_len=128):

    y, sr = librosa.load(
        audio_path,
        sr=16000,
        mono=True
    )


    mfcc = librosa.feature.mfcc(
        y=y,
        sr=sr,
        n_mfcc=40
    )


    if mfcc.shape[1] < max_pad_len:

        pad_width = max_pad_len - mfcc.shape[1]

        mfcc = np.pad(
            mfcc,
            ((0,0),(0,pad_width))
        )

    else:

        mfcc = mfcc[:, :max_pad_len]


    return mfcc



# ===============================
# Prediction Function
# ===============================

def predict_audio(audio_path):


    # Convert AAC/M4A/MP3 → WAV

    wav_file = convert_to_wav(audio_path)


    mfcc = extract_mfcc(wav_file)


    # CNN input shape
    # (batch,height,width,channel)

    mfcc = np.expand_dims(
        mfcc,
        axis=-1
    )


    mfcc = np.expand_dims(
        mfcc,
        axis=0
    )


    prediction = model.predict(mfcc)


    index = np.argmax(prediction)


    label = encoder.inverse_transform(
        [index]
    )


    confidence = float(
        np.max(prediction)
    )


    return label[0], confidence



# ===============================
# Test
# ===============================

if __name__ == "__main__":


    audio_file = "test"   # your AAC file


    result, confidence = predict_audio(
        audio_file
    )


    print(
        "Prediction:",
        result
    )

    print(
        "Confidence:",
        confidence
    )