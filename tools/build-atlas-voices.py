from pathlib import Path
import subprocess, wave, json, hashlib, argparse
import numpy as np
parser=argparse.ArgumentParser(description="Apply approved ATLAS voice preset; requires NumPy and FFmpeg.")
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--masters',type=Path,required=True)
parser.add_argument('--reference',type=Path,required=True)
a=parser.parse_args()
sr=44100
def read(path, filters=None):
    cmd=['ffmpeg','-v','error','-i',str(path)]
    if filters: cmd += ['-af',filters]
    cmd += ['-ar',str(sr),'-ac','1','-f','f32le','pipe:1']
    return np.frombuffer(subprocess.run(cmd,capture_output=True,check=True).stdout,dtype='<f4').astype(float)
def profile(x):
    n=2048
    frames=np.lib.stride_tricks.sliding_window_view(x,n)[::1024]
    power=np.mean(frames**2,axis=1)
    active=frames[power>max(power.max()*.015,1e-10)]
    spec=np.mean(np.abs(np.fft.rfft(active*np.hanning(n),axis=1))**2,axis=0)
    freq=np.fft.rfftfreq(n,1/sr)
    bands=[]
    for lo,hi in [(80,180),(180,350),(350,700),(700,1400),(1400,2800),(2800,5600),(5600,11000)]:
        bands.append(np.sum(spec[(freq>=lo)&(freq<hi)]))
    bands=np.array(bands)
    db=10*np.log10(np.maximum(bands,1e-15)/sum(bands))
    rms=np.sqrt(np.mean(active**2))
    return db,rms
rng=np.random.default_rng(42)
t=np.arange(int(sr*.9))/sr
noise=np.convolve(rng.standard_normal(len(t)),np.ones(9)/9,mode='same')
ir=noise*np.exp(-6.908*np.maximum(t-.025,0)/.7)*np.clip((t-.025)/.025,0,1)
ir/=np.sqrt(np.sum(ir**2))
ref=read(a.reference)
rdb,rrms=profile(ref)
records=[]
files=sorted(a.source.rglob('*.mp3'))
assert files, 'No MP3 inputs'
for src in files:
    relative=src.relative_to(a.source)
    wav=(a.masters/relative).with_suffix('.wav')
    mp3=a.output/relative
    if wav.exists() or mp3.exists():raise FileExistsError(str(mp3))
    wav.parent.mkdir(parents=True,exist_ok=True)
    mp3.parent.mkdir(parents=True,exist_ok=True)
    x=read(src)
    input_seconds=len(x)/sr
    db,rms=profile(x)
    gains=np.clip((rdb-db)*.55,-4,4)
    filters=','.join('equalizer=f=%s:t=o:w=1:g=%.3f'%(f,g) for f,g in zip([120,250,500,1000,2000,4000,8000],gains))
    x=read(src,filters)
    _,rms=profile(x)
    x*=min(rrms/rms,.891/max(np.max(np.abs(x)),1e-12))
    # Match the approved reference-preparation stage's PCM16 quantization.
    x=(np.clip(x,-1,1)*32767).astype('<i2').astype(float)/32768
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
    with wave.open(str(wav),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr)
        f.writeframes((np.clip(y,-1,1)*32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg','-v','error','-i',str(wav),'-c:a','libmp3lame','-b:a','192k',str(mp3)],check=True)
    decoded=read(mp3)
    assert np.isfinite(decoded).all() and np.max(np.abs(decoded))<1
    assert abs(len(decoded)/sr-(input_seconds+1.6))<.02
    records.append({'source':relative.as_posix(),'url':'/audio/atlas/'+relative.as_posix(),'category':relative.parent.as_posix(),'duration_seconds':round(len(decoded)/sr,3),'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'output_sha256':hashlib.sha256(mp3.read_bytes()).hexdigest(),'reference_eq_db':gains.round(3).tolist(),'decoded_peak_dbfs':round(float(20*np.log10(np.max(np.abs(decoded)))),2)})
    print(f'{len(records)}/{len(files)} {relative}',flush=True)
(a.output/'manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('Verified',len(records),'MP3 files; masters at',a.masters)
