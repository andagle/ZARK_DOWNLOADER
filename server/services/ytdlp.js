const { execFile, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const YTDLP_PATH =
    process.env.YTDLP_PATH ||
    (
        process.platform === "win32"
            ? path.join(
                __dirname,
                "..",
                "..",
                "tools",
                "yt-dlp.exe"
            )
            : "yt-dlp"
    );

const DOWNLOADS_DIR =
    process.env.DOWNLOADS_DIR ||
    path.join(__dirname, "..", "..", "downloads");

fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        execFile(
            YTDLP_PATH,
            args,
            {
                maxBuffer: 100 * 1024 * 1024
            },
            (error, stdout, stderr) => {
                if (error) {
                    return reject(
                        new Error(stderr || error.message)
                    );
                }

                resolve(stdout);
            }
        );
    });
}

function downloadWithProgress(args, onProgress) {
    return new Promise((resolve, reject) => {
        const process = spawn(YTDLP_PATH, args, {
            windowsHide: true
        });

        let stderr = "";

        process.stdout.on("data", (data) => {
            const output = data.toString();

            // Example yt-dlp output:
            // [download]  42.5% of 10.00MiB at 2.50MiB/s ETA 00:02

            const match = output.match(
                /\[download\]\s+(\d+(?:\.\d+)?)%/
            );

            if (match) {
                const percent = Number(match[1]);

                if (onProgress) {
                    onProgress(percent);
                }
            }
        });

        process.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        process.on("error", (error) => {
            reject(error);
        });

        process.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        stderr ||
                        `yt-dlp exited with code ${code}`
                    )
                );
            }
        });
    });
}

async function getVideoInfo(url) {
    const output = await runYtDlp([
        "--js-runtimes",
        "node",
        "--remote-components",
        "ejs:github",
        "--dump-single-json",
        "--no-playlist",
        url
    ]);

    try {
        return JSON.parse(output);
    } catch {
        throw new Error("Failed to parse yt-dlp response");
    }
}

async function getVideoFormats(url) {
    const video = await getVideoInfo(url);

    const qualityMap = new Map();

    for (const format of video.formats) {
        if (
            !format.height ||
            !format.vcodec ||
            format.vcodec === "none"
        ) {
            continue;
        }

        // We only want MP4 video formats
        if (format.ext !== "mp4") {
            continue;
        }

        const height = format.height;

        // Ignore unusual resolutions
        if (height < 144) {
            continue;
        }

        // Keep the first/best format for each resolution
        if (!qualityMap.has(height)) {
            qualityMap.set(height, {
                format_id: format.format_id,
                quality: `${height}p`,
                width: format.width,
                height: format.height,
                fps: format.fps,
                extension: "mp4",
                video_codec: format.vcodec,
                has_audio:
                    format.acodec &&
                    format.acodec !== "none"
            });
        }
    }

    const formats = Array.from(qualityMap.values())
        .sort((a, b) => b.height - a.height);

    return {
        title: video.title,
        thumbnail: video.thumbnail,
        duration: video.duration,
        formats
    };
}

async function downloadVideo(url, quality, onProgress) {
    const height = parseInt(quality.replace("p", ""), 10);

    const outputPath = path.join(
    DOWNLOADS_DIR,
    "%(title)s.%(ext)s"
);

    await downloadWithProgress([
    "--js-runtimes",
    "node",
    "--newline",
    "--no-playlist",
    "-f",
    `bv*[height<=${height}][ext=mp4]+ba/b[height<=${height}][ext=mp4]`,
    "--merge-output-format",
    "mp4",
    "-o",
    outputPath,
    url
    ], onProgress);

    return true;
}

async function downloadAudio(url, onProgress) {
    const outputPath = path.join(
    DOWNLOADS_DIR,
    "%(title)s.%(ext)s"
);

    await downloadWithProgress([
        "--js-runtimes",
        "node",
        "--newline",
        "--no-playlist",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "-o",
        outputPath,
        url
    ], onProgress);

    return true;
}

module.exports = {
    getVideoInfo,
    getVideoFormats,
    downloadVideo,
    downloadAudio
};