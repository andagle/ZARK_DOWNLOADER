const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const {
    getVideoInfo,
    getVideoFormats,
    downloadVideo,
    downloadAudio
} = require("./services/ytdlp");

const app = express();
const PORT = 4000;

const downloadJobs = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Universal Video Downloader API is running!"
    });
});

// ========================================
// VIDEO INFO
// ========================================

app.post("/api/video/info", async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: "Video URL is required."
            });
        }

        console.log(`Getting video info: ${url}`);

        const video = await getVideoInfo(url);

        res.json({
            success: true,
            video: {
                title: video.title,
                description: video.description,
                thumbnail: video.thumbnail,
                duration: video.duration,
                uploader: video.uploader,
                webpage_url: video.webpage_url
            }
        });

    } catch (error) {
        console.error("Video info error:", error.message);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve video information.",
            error: error.message
        });
    }
});

// ========================================
// VIDEO FORMATS
// ========================================

app.post("/api/video/formats", async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: "Video URL is required."
            });
        }

        console.log(`Getting video formats: ${url}`);

        const result = await getVideoFormats(url);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error("Format detection error:", error.message);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve video formats.",
            error: error.message
        });
    }
});

// ========================================
// VIDEO DOWNLOAD
// ========================================

app.post("/api/video/download", async (req, res) => {
    try {
        const { url, quality } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: "Video URL is required."
            });
        }

        if (!quality) {
            return res.status(400).json({
                success: false,
                message: "Video quality is required."
            });
        }

        const jobId = crypto.randomUUID();

        downloadJobs.set(jobId, {
            type: "video",
            status: "starting",
            progress: 0,
            file: null,
            error: null
        });

        console.log(
            `Starting video download [${jobId}]: ${quality} - ${url}`
        );

        // Start download in background
        downloadVideo(
            url,
            quality,
            (progress) => {
                const job = downloadJobs.get(jobId);

                if (job) {
                    job.progress = progress;
                    job.status = "downloading";
                }
            }
        )
        .then(() => {
            const downloadsPath = path.join(
                "E:",
                "ZATARA_FILES",
                "youtube-downloader",
                "downloads"
            );

            const files = fs.readdirSync(downloadsPath);

            const mp4Files = files
                .filter(file =>
                    file.toLowerCase().endsWith(".mp4")
                )
                .map(file => ({
                    file,
                    time: fs.statSync(
                        path.join(downloadsPath, file)
                    ).mtimeMs
                }))
                .sort((a, b) => b.time - a.time);

            if (mp4Files.length === 0) {
                throw new Error(
                    "Downloaded video file was not found."
                );
            }

            const latestFile = mp4Files[0].file;

            const job = downloadJobs.get(jobId);

            if (job) {
                job.status = "completed";
                job.progress = 100;
                job.file = latestFile;
            }

            console.log(
                `Video download completed [${jobId}]: ${latestFile}`
            );
        })
        .catch((error) => {
            console.error(
                `Video download failed [${jobId}]:`,
                error.message
            );

            const job = downloadJobs.get(jobId);

            if (job) {
                job.status = "error";
                job.error = error.message;
            }
        });

        res.json({
            success: true,
            jobId
        });

    } catch (error) {
        console.error(
            "Download initialization error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Failed to start video download.",
            error: error.message
        });
    }
});

// ========================================
// AUDIO DOWNLOAD (MP3)
// ========================================

app.post("/api/video/audio", async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                success: false,
                message: "Video URL is required."
            });
        }

        const jobId = crypto.randomUUID();

        downloadJobs.set(jobId, {
            type: "audio",
            status: "starting",
            progress: 0,
            file: null,
            error: null
        });

        console.log(
            `Starting MP3 download [${jobId}]: ${url}`
        );

        downloadAudio(
            url,
            (progress) => {
                const job = downloadJobs.get(jobId);

                if (job) {
                    job.progress = progress;
                    job.status = "downloading";
                }
            }
        )
        .then(() => {
            const downloadsPath = path.join(
                "E:",
                "ZATARA_FILES",
                "youtube-downloader",
                "downloads"
            );

            const files = fs.readdirSync(downloadsPath);

            const mp3Files = files
                .filter(file =>
                    file.toLowerCase().endsWith(".mp3")
                )
                .map(file => ({
                    file,
                    time: fs.statSync(
                        path.join(downloadsPath, file)
                    ).mtimeMs
                }))
                .sort((a, b) => b.time - a.time);

            if (mp3Files.length === 0) {
                throw new Error(
                    "Downloaded MP3 file was not found."
                );
            }

            const latestFile = mp3Files[0].file;

            const job = downloadJobs.get(jobId);

            if (job) {
                job.status = "completed";
                job.progress = 100;
                job.file = latestFile;
            }

            console.log(
                `MP3 download completed [${jobId}]: ${latestFile}`
            );
        })
        .catch((error) => {
            console.error(
                `MP3 download failed [${jobId}]:`,
                error.message
            );

            const job = downloadJobs.get(jobId);

            if (job) {
                job.status = "error";
                job.error = error.message;
            }
        });

        res.json({
            success: true,
            jobId
        });

    } catch (error) {
        console.error(
            "MP3 download initialization error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Failed to start MP3 download.",
            error: error.message
        });
    }
});

app.get("/api/video/progress/:jobId", (req, res) => {
    const { jobId } = req.params;

    const job = downloadJobs.get(jobId);

    if (!job) {
        return res.status(404).json({
            success: false,
            message: "Download job not found."
        });
    }

    res.json({
        success: true,
        job
    });
});

app.get("/api/video/file/:jobId", (req, res) => {
    const { jobId } = req.params;

    const job = downloadJobs.get(jobId);

    if (!job) {
        return res.status(404).json({
            success: false,
            message: "Download job not found."
        });
    }

    if (job.status !== "completed" || !job.file) {
        return res.status(400).json({
            success: false,
            message: "Download is not ready yet."
        });
    }

    const downloadsPath = path.join(
        "E:",
        "ZATARA_FILES",
        "youtube-downloader",
        "downloads"
    );

    const filePath = path.join(
        downloadsPath,
        job.file
    );

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "Downloaded file no longer exists."
        });
    }

    res.download(
        filePath,
        job.file,
        (error) => {
            if (error) {
                console.error(
                    `File send error [${jobId}]:`,
                    error.message
                );
            }
        }
    );
});

app.get("/api/video/audio-file/:jobId", (req, res) => {
    const { jobId } = req.params;

    const job = downloadJobs.get(jobId);

    if (!job) {
        return res.status(404).json({
            success: false,
            message: "Download job not found."
        });
    }

    if (
        job.status !== "completed" ||
        !job.file
    ) {
        return res.status(400).json({
            success: false,
            message: "MP3 download is not ready yet."
        });
    }

    const downloadsPath = path.join(
        "E:",
        "ZATARA_FILES",
        "youtube-downloader",
        "downloads"
    );

    const filePath = path.join(
        downloadsPath,
        job.file
    );

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "Downloaded MP3 file no longer exists."
        });
    }

    res.download(
        filePath,
        job.file,
        (error) => {
            if (error) {
                console.error(
                    `MP3 file send error [${jobId}]:`,
                    error.message
                );
            }
        }
    );
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
    console.log(
        `Server running at http://localhost:${PORT}`
    );
});