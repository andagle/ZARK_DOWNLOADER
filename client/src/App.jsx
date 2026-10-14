import { useState } from "react";

const API = "http://localhost:4000/api/video";

async function postJson(path, body) {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  }

  return res;
}

function formatDuration(value) {
  if (value == null || value === "") return "";

  if (typeof value === "string" && value.includes(":")) {
    return value;
  }

  const total = Math.round(Number(value));

  if (!Number.isFinite(total)) {
    return String(value);
  }

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const pad = (n) => String(n).padStart(2, "0");

  return h
    ? `${h}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`;
}

function normalizeFormats(data) {
  const list = Array.isArray(data)
    ? data
    : data?.formats || data?.qualities || data?.data || [];

  const map = new Map();

  for (const f of list) {
    const quality =
      typeof f === "string"
        ? f
        : f.quality || (f.height ? `${f.height}p` : null);

    if (!quality) continue;

    const height =
      typeof f === "object" && f.height
        ? f.height
        : parseInt(quality, 10) || 0;

    if (!map.has(quality)) {
      map.set(quality, {
        quality,
        height,
      });
    }
  }

  return [...map.values()].sort(
    (a, b) => b.height - a.height
  );
}

function filenameFromHeader(header, fallback) {
  if (!header) return fallback;

  const star = header.match(
    /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i
  );

  if (star) {
    try {
      return decodeURIComponent(
        star[1].trim().replace(/^"|"$/g, "")
      );
    } catch {
      // Continue to normal filename handling
    }
  }

  const plain = header.match(
    /filename\s*=\s*"?([^";]+)"?/i
  );

  return plain ? plain[1].trim() : fallback;
}

async function saveBlobResponse(res, fallbackFilename) {
  const filename = filenameFromHeader(
    res.headers.get("Content-Disposition"),
    fallbackFilename
  );

  const blob = await res.blob();

  const href = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = href;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(href);

  return filename;
}

export default function App() {
  const [url, setUrl] = useState("");
  const [analyzedUrl, setAnalyzedUrl] = useState("");

  const [info, setInfo] = useState(null);
  const [formats, setFormats] = useState([]);
  const [quality, setQuality] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [loadingFormats, setLoadingFormats] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingAudio, setDownloadingAudio] = useState(false);

  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleAnalyze(e) {
    e.preventDefault();

    if (analyzing) return;

    const target = url.trim();

    if (!target) {
      setError("Please enter a video URL.");
      return;
    }

    setError("");
    setNotice("");
    setInfo(null);
    setFormats([]);
    setQuality("");
    setAnalyzedUrl("");
    setAnalyzing(true);

    try {
      // Get video information
      const infoRes = await postJson("info", {
        url: target,
      });

      const infoData = await infoRes.json();

      if (!infoData.success || !infoData.video) {
        throw new Error(
          infoData.message || "Video information was not found."
        );
      }

      setInfo(infoData.video);
      setAnalyzedUrl(target);

      // Get available qualities
      setLoadingFormats(true);

      const formatsRes = await postJson("formats", {
        url: target,
      });

      const formatsData = await formatsRes.json();

      const list = normalizeFormats(formatsData);

      setFormats(list);
      setQuality(list[0]?.quality || "");

      if (!list.length) {
        setError(
          "No downloadable video qualities were found."
        );
      }
    } catch (err) {
      console.error("Analyze failed:", err);

      setError(
        "Unable to analyze this video. Please check the URL and try again."
      );
    } finally {
      setAnalyzing(false);
      setLoadingFormats(false);
    }
  }

  const waitForDownload = async (jobId) => {
    return new Promise((resolve, reject) => {
        const checkProgress = async () => {
            try {
                const response = await fetch(
                    `${API}/progress/${jobId}`
                );

                const data = await response.json();

                if (!data.success) {
                    throw new Error(
                        data.message || "Failed to get download progress."
                    );
                }

                const job = data.job;

                setDownloadProgress(job.progress || 0);

                if (job.status === "starting") {
                    setDownloadStatus("Preparing video...");
                }

                if (job.status === "downloading") {
                    setDownloadStatus(
                        `Downloading ${Math.round(job.progress)}%`
                    );
                }

                if (job.status === "completed") {
                    setDownloadStatus("Download ready!");
                    resolve(job);
                    return;
                }

                if (job.status === "error") {
                    reject(
                        new Error(
                            job.error || "Download failed."
                        )
                    );
                    return;
                }

                setTimeout(checkProgress, 500);

            } catch (error) {
                reject(error);
            }
        };

        checkProgress();
    });
};

async function handleDownload() {
    if (!analyzedUrl || !quality) return;

    setDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus("Starting download...");
    setError("");
    setNotice("");

    try {
        const response = await postJson(
            "download",
            {
                url: analyzedUrl,
                quality
            }
        );

        const data = await response.json();

        if (!data.success || !data.jobId) {
            throw new Error(
                data.message || "Failed to start download."
            );
        }

        const job = await waitForDownload(data.jobId);

        if (!job.file) {
            throw new Error(
                "Downloaded file was not found."
            );
        }

        const fileResponse = await fetch(
            `${API}/file/${data.jobId}`
        );

        if (!fileResponse.ok) {
            throw new Error(
                "Failed to retrieve downloaded video."
            );
        }

        await saveBlobResponse(
            fileResponse,
            job.file || "video.mp4"
        );

        setDownloadProgress(100);
        setDownloadStatus("Download complete!");
        setNotice("Video downloaded successfully.");

    } catch (error) {
        console.error(error);

        setError(
            error.message || "Video download failed."
        );

        setDownloadStatus("");
    } finally {
        setDownloading(false);
    }
}

 async function handleAudioDownload() {
    if (
        downloading ||
        downloadingAudio ||
        !analyzedUrl
    ) {
        return;
    }

    setError("");
    setNotice("");
    setDownloadingAudio(true);
    setDownloadProgress(0);
    setDownloadStatus("Starting MP3 download...");

    try {
        const response = await postJson(
            "audio",
            {
                url: analyzedUrl,
            }
        );

        const data = await response.json();

        if (!data.success || !data.jobId) {
            throw new Error(
                data.message ||
                "Failed to start MP3 download."
            );
        }

        const job = await waitForDownload(
            data.jobId
        );

        if (!job.file) {
            throw new Error(
                "Downloaded MP3 file was not found."
            );
        }

        const fileResponse = await fetch(
            `${API}/audio-file/${data.jobId}`
        );

        if (!fileResponse.ok) {
            throw new Error(
                "Failed to retrieve downloaded MP3."
            );
        }

        const filename = await saveBlobResponse(
            fileResponse,
            job.file || "audio.mp3"
        );

        setDownloadProgress(100);
        setDownloadStatus("MP3 download complete!");
        setNotice(
            `Downloaded ${filename}`
        );

    } catch (error) {
        console.error(
            "MP3 download failed:",
            error
        );

        setError(
            error.message ||
            "Unable to download the MP3."
        );

        setDownloadStatus("");
    } finally {
        setDownloadingAudio(false);
    }
}

  const title =
    info?.title || "Untitled video";

  const creator =
    info?.uploader ||
    info?.channel ||
    info?.creator ||
    "";

  const duration = formatDuration(
    info?.duration_string ||
    info?.duration
  );

  const thumb =
    info?.thumbnail ||
    info?.thumbnail_url ||
    "";

  const buttonsDisabled =
    downloading ||
    downloadingAudio ||
    loadingFormats;

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />

      <header className="header">
        <span className="logo" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
          </svg>
        </span>

        <span className="brand">
          Universal Downloader
        </span>

        <span className="tag">
          Fast · Simple · Local
        </span>
      </header>

      <main className="main">
        <section className="hero">
          <h1>Universal Video Downloader</h1>

          <p>
            Download videos quickly and easily from
            supported video platforms.
          </p>
        </section>

        <form
          className="search"
          onSubmit={handleAnalyze}
        >
          <label
            htmlFor="video-url"
            className="sr-only"
          >
            Video URL
          </label>

          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
            <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
          </svg>

          <input
            id="video-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck="false"
            placeholder="Paste a video URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={analyzing}
          />

          <button
            type="submit"
            className="btn btn-gradient"
            disabled={analyzing}
          >
            {analyzing ? (
              <span
                className="spinner"
                aria-hidden="true"
              />
            ) : null}

            {analyzing
              ? "Analyzing"
              : "Analyze"}
          </button>
        </form>

        <div
          className="status"
          aria-live="polite"
        >
          {analyzing && (
            <p className="status-line">
              <span
                className="spinner"
                aria-hidden="true"
              />

              Analyzing video...
            </p>
          )}

          {error && (
            <p
              className="status-line error"
              role="alert"
            >
              {error}
            </p>
          )}

          {notice && !error && (
            <p className="status-line ok">
              {notice}
            </p>
          )}
        </div>

        {info && (
          <article
            className="card"
            aria-label="Video information"
          >
            <div className="thumb">
              {thumb ? (
                <img
                  src={thumb}
                  alt={`Thumbnail for ${title}`}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="thumb-empty">
                  No preview
                </div>
              )}

              {duration && (
                <span className="badge">
                  {duration}
                </span>
              )}
            </div>

            <div className="details">
              <h2>{title}</h2>

              <p className="meta">
                {[creator, duration]
                  .filter(Boolean)
                  .join(" • ")}
              </p>

              <label
                htmlFor="quality"
                className="field-label"
              >
                Video Quality
              </label>

              <div className="select-wrap">
                <select
                  id="quality"
                  value={quality}
                  onChange={(e) =>
                    setQuality(e.target.value)
                  }
                  disabled={
                    loadingFormats ||
                    buttonsDisabled ||
                    !formats.length
                  }
                >
                  {loadingFormats && (
                    <option>
                      Loading qualities...
                    </option>
                  )}

                  {!loadingFormats &&
                    !formats.length && (
                      <option>
                        No qualities available
                      </option>
                    )}

                  {formats.map((f) => (
                    <option
                      key={f.quality}
                      value={f.quality}
                    >
                      {f.quality}
                    </option>
                  ))}
                </select>
              </div>

              <div className="download-actions">
                <button
                  type="button"
                  className="btn btn-gradient btn-download"
                  onClick={handleDownload}
                  disabled={
                    buttonsDisabled ||
                    !quality
                  }
                >
                  {downloading ? (
                    <>
                      <span
                        className="spinner"
                        aria-hidden="true"
                      />

                      Preparing video...
                    </>
                  ) : (
                    <>
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
                      </svg>

                      Download Video
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-audio"
                  onClick={handleAudioDownload}
                  disabled={
                    buttonsDisabled ||
                    !analyzedUrl
                  }
                >
                  {downloadingAudio ? (
                    <>
                      <span
                        className="spinner"
                        aria-hidden="true"
                      />

                      Preparing MP3...
                    </>
                  ) : (
                    <>
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9 18V5l10-2v13" />
                        <circle
                          cx="6"
                          cy="18"
                          r="3"
                        />
                        <circle
                          cx="16"
                          cy="16"
                          r="3"
                        />
                      </svg>

                      Download MP3
                    </>
                  )}
                </button>
              </div>
              {(downloading || downloadingAudio) && (
                <div className="download-progress">
                  <div className="progress-header">
                    <span>{downloadStatus}</span>
                    <span>{Math.round(downloadProgress)}%</span>
                  </div>

                  <div className="progress-track">
                    <div
                      className="progress-bar"
                      style={{
                        width: `${downloadProgress}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}