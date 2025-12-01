import { useEffect, useRef } from 'react';

export function AudioLevelIndicator({ track }: { track: MediaStreamTrack }) {
    const animationRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);

    // Refs for the bar elements
    const bar1Ref = useRef<HTMLDivElement>(null);
    const bar2Ref = useRef<HTMLDivElement>(null);
    const bar3Ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!track) {
            console.warn('[AudioLevelIndicator] No track provided');
            return;
        }

        console.log(
            '[AudioLevelIndicator] Initializing for track:',
            track.id,
            track.readyState,
        );

        const audioContext = new (window.AudioContext ||
            (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;

        if (audioContext.state === 'suspended') {
            console.log(
                '[AudioLevelIndicator] AudioContext suspended, waiting for user interaction...',
            );
            const resumeContext = () => {
                if (audioContext.state === 'suspended') {
                    audioContext.resume().then(() => {
                        console.log(
                            '[AudioLevelIndicator] AudioContext resumed by user interaction',
                        );
                    });
                }
            };
            window.addEventListener('click', resumeContext);
            window.addEventListener('keydown', resumeContext);

            // Try immediately just in case
            audioContext.resume().catch(() => {});

            return () => {
                window.removeEventListener('click', resumeContext);
                window.removeEventListener('keydown', resumeContext);
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
                }
                if (sourceRef.current) {
                    sourceRef.current.disconnect();
                }
                if (audioContextRef.current) {
                    audioContextRef.current.close();
                }
            };
        }

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; // Good balance
        analyser.smoothingTimeConstant = 0.5; // Responsive
        analyserRef.current = analyser;

        try {
            const stream = new MediaStream([track]);
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            sourceRef.current = source;
            console.log('[AudioLevelIndicator] Source connected');
        } catch (error) {
            console.error(
                '[AudioLevelIndicator] Error creating media stream source:',
                error,
            );
            return;
        }

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateVolume = () => {
            if (!analyserRef.current) return;

            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const volume = Math.min(100, average * 2.5); // Scale up

            // Direct DOM update
            if (bar1Ref.current) {
                bar1Ref.current.style.height = `${Math.max(10, volume)}%`;
            }
            if (bar2Ref.current) {
                bar2Ref.current.style.height = `${Math.max(10, volume * 0.7)}%`;
            }
            if (bar3Ref.current) {
                bar3Ref.current.style.height = `${Math.max(10, volume * 0.4)}%`;
            }

            animationRef.current = requestAnimationFrame(updateVolume);
        };

        updateVolume();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            if (sourceRef.current) {
                sourceRef.current.disconnect();
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, [track]);

    return (
        <div className="flex h-4 w-6 items-end gap-0.5">
            <div
                ref={bar1Ref}
                className="w-1.5 rounded-t bg-green-500 transition-all duration-75"
                style={{ height: '10%' }}
            />
            <div
                ref={bar2Ref}
                className="w-1.5 rounded-t bg-green-500 transition-all duration-75"
                style={{ height: '10%' }}
            />
            <div
                ref={bar3Ref}
                className="w-1.5 rounded-t bg-green-500 transition-all duration-75"
                style={{ height: '10%' }}
            />
        </div>
    );
}
