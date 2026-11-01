"""Build the Start sync guide with edge-tts (pip install edge-tts).

Run from the repository root. Generation uses Microsoft's online neural voice;
the website itself plays the saved local MP3 and makes no speech-service calls.
"""
import asyncio
from pathlib import Path
import edge_tts

TEXT = (
    "Let's line things up. Watch the light, and listen to the click. "
    "Turn the sync knob until they happen together. "
    "When it feels right, choose Use this offset."
)
VOICE = "en-GB-SoniaNeural"


async def main():
    destination = Path(__file__).resolve().parents[1] / "assets/audio/sync-guide.mp3"
    await edge_tts.Communicate(TEXT, VOICE, rate="-5%").save(str(destination))
    print(destination)


if __name__ == "__main__":
    asyncio.run(main())
