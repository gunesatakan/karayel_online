from pathlib import Path
import subprocess, wave
import numpy as np
root=Path('C:/Users/aliat/Downloads/conv-1')
out=Path('C:/Users/aliat/Downloads/conv-1-efektli')
names=['01vesayat-1', '02atlas-1', '03vesayat-2', '04atlas-2']
sr=44100
rng=np.random.default_rng(42)
t=np.arange(int(sr*.9))/sr
noise=np.convolve(rng.standard_normal(len(t)),np.ones(9)/9,mode='same')
ir=noise*np.exp(-6.908*np.maximum(t-.025,0)/.7)*np.clip((t-.025)/.025,0,1)
ir/=np.sqrt(np.sum(ir**2))
for name in names:
    src=root/(name+'.mp3')
    raw=subprocess.run(['ffmpeg','-v','error','-i',str(src),'-ar',str(sr),'-ac','1','-f','f32le','pipe:1'],capture_output=True,check=True).stdout
    x=np.frombuffer(raw,dtype='<f4').astype(float)
    raw_phase=subprocess.run(['ffmpeg','-v','error','-f','f32le','-ar',str(sr),'-ac','1','-i','pipe:0','-af','aphaser=in_gain=0.8:out_gain=1:delay=2:decay=0.3:speed=0.35:type=s','-f','f32le','pipe:1'],input=x.astype('<f4').tobytes(),capture_output=True,check=True).stdout
    phased=np.frombuffer(raw_phase,dtype='<f4').astype(float)
    assert len(x)==len(phased)
    x=.70*x+.30*phased
    offset1=int(sr*.35)
    offset2=int(sr*.70)
    dry=np.zeros(len(x)+offset2)
    echo1=np.zeros_like(dry)
    echo2=np.zeros_like(dry)
    dry[:len(x)]=.88*x
    echo1[offset1:offset1+len(x)]=.88*.09*x
    echo2[offset2:offset2+len(x)]=.88*.01*x
    # Separate reverb sends relative to each signal: main 6%, first echo 35%, second 75%.
    reverb_input=.06*dry+.35*echo1+.75*echo2
    n=len(dry)+len(ir)-1
    size=1<<(n-1).bit_length()
    y=np.fft.irfft(np.fft.rfft(reverb_input,size)*np.fft.rfft(ir,size),size)[:n]
    y[:len(dry)]+=dry+echo1+echo2
    peak=np.max(np.abs(y))
    if peak>.891:y*=.891/peak
    assert np.isfinite(y).all()
    wav=out/(name+'.wav')
    with wave.open(str(wav),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr)
        f.writeframes((np.clip(y,-1,1)*32767).astype('<i2').tobytes())
    mp3=wav.with_suffix('.mp3')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','192k',str(mp3)],check=True)
    subprocess.run(['ffmpeg','-v','error','-i',str(mp3),'-f','null','-'],check=True)
    print(mp3)
