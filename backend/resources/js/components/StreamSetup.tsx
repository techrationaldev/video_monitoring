import { useEffect, useRef, useState } from 'react';

interface StreamSetupProps {
    onReady: (
        stream: MediaStream,
        videoEnabled: boolean,
        audioEnabled: boolean,
    ) => void;
}

export default function StreamSetup({ onReady }: StreamSetupProps) {
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
    const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        getDevices();
    }, []);

    useEffect(() => {
        startPreview();
        return () => {
            if (stream) {
                stream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [selectedVideoDevice, selectedAudioDevice]);

    useEffect(() => {
        if (stream) {
            stream
                .getVideoTracks()
                .forEach((track) => (track.enabled = videoEnabled));
            stream
                .getAudioTracks()
                .forEach((track) => (track.enabled = audioEnabled));
        }
    }, [videoEnabled, audioEnabled, stream]);

    const getDevices = async () => {
        try {
            await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            }); // Request permission first
            const devices = await navigator.mediaDevices.enumerateDevices();
            setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
            setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));

            const videoDev = devices.find((d) => d.kind === 'videoinput');
            const audioDev = devices.find((d) => d.kind === 'audioinput');

            if (videoDev) setSelectedVideoDevice(videoDev.deviceId);
            if (audioDev) setSelectedAudioDevice(audioDev.deviceId);
        } catch (err) {
            console.error('Error getting devices:', err);
        }
    };

    const startPreview = async () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }

        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: selectedVideoDevice
                    ? { deviceId: { exact: selectedVideoDevice } }
                    : true,
                audio: selectedAudioDevice
                    ? { deviceId: { exact: selectedAudioDevice } }
                    : true,
            });

            setStream(newStream);
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
        } catch (err) {
            console.error('Error starting preview:', err);
        }
    };

    const handleStart = () => {
        if (stream) {
            onReady(stream, videoEnabled, audioEnabled);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
            <div className="w-full max-w-md overflow-hidden rounded-xl bg-gray-800 shadow-2xl">
                <div className="relative aspect-video bg-black">
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className={`h-full w-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
                    />
                    {!videoEnabled && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                            Camera Off
                        </div>
                    )}

                    <div className="absolute right-0 bottom-4 left-0 flex justify-center gap-4">
                        <button
                            onClick={() => setAudioEnabled(!audioEnabled)}
                            className={`rounded-full p-3 ${audioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} transition-colors`}
                        >
                            {audioEnabled ? 'Mic On' : 'Mic Off'}
                        </button>
                        <button
                            onClick={() => setVideoEnabled(!videoEnabled)}
                            className={`rounded-full p-3 ${videoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} transition-colors`}
                        >
                            {videoEnabled ? 'Cam On' : 'Cam Off'}
                        </button>
                    </div>
                </div>

                <div className="space-y-4 p-6">
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Camera
                        </label>
                        <select
                            value={selectedVideoDevice}
                            onChange={(e) =>
                                setSelectedVideoDevice(e.target.value)
                            }
                            className="w-full rounded-lg border-none bg-gray-700 px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                        >
                            {videoDevices.map((device) => (
                                <option
                                    key={device.deviceId}
                                    value={device.deviceId}
                                >
                                    {device.label ||
                                        `Camera ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-400">
                            Microphone
                        </label>
                        <select
                            value={selectedAudioDevice}
                            onChange={(e) =>
                                setSelectedAudioDevice(e.target.value)
                            }
                            className="w-full rounded-lg border-none bg-gray-700 px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500"
                        >
                            {audioDevices.map((device) => (
                                <option
                                    key={device.deviceId}
                                    value={device.deviceId}
                                >
                                    {device.label ||
                                        `Mic ${device.deviceId.slice(0, 5)}...`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={handleStart}
                        className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 font-bold text-white transition-colors hover:bg-indigo-700"
                    >
                        Start Streaming
                    </button>
                </div>
            </div>
        </div>
    );
}
