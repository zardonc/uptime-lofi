import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api/client';
import type { ProbeConfigData, ProbePlatform } from '../api/types';

const platforms: ReadonlyArray<ProbePlatform> = ['linux/amd64', 'linux/arm64', 'darwin/amd64', 'darwin/arm64'];

const platformLabels: Readonly<Record<ProbePlatform, string>> = {
  'linux/amd64': 'Linux amd64',
  'linux/arm64': 'Linux arm64',
  'darwin/amd64': 'macOS amd64',
  'darwin/arm64': 'macOS arm64',
};

export function ProbeSetup() {
  const [name, setName] = useState('my-server');
  const [platform, setPlatform] = useState<ProbePlatform>('linux/amd64');
  const [config, setConfig] = useState<ProbeConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandCopied, setCommandCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const selectedDownload = config?.downloads[platform.replace('/', '_') as keyof ProbeConfigData['downloads']];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setCommandCopied(false);
    setConfigCopied(false);
    setShowManual(false);

    try {
      const response = await api.createProbeConfig({ name, platform });
      setConfig(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the install command. Try again, or use the manual config fallback.');
    } finally {
      setLoading(false);
    }
  };

  const copyCommand = async () => {
    if (!config) return;
    await navigator.clipboard.writeText(config.install_command);
    setCommandCopied(true);
  };

  const copyConfig = async () => {
    if (!config) return;
    await navigator.clipboard.writeText(config.config_yaml);
    setConfigCopied(true);
  };

  const downloadConfig = () => {
    if (!config) return;
    const url = URL.createObjectURL(new Blob([config.config_yaml], { type: 'text/yaml' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'config.yaml';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="probe-setup">
      <form className="probe-setup__form" onSubmit={submit}>
        <div className="probe-setup__field">
          <label htmlFor="probe-name">Node name</label>
          <input
            id="probe-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="prod-vps-1"
            maxLength={80}
          />
        </div>

        <div className="probe-setup__field">
          <label htmlFor="probe-platform">Platform</label>
          <select
            id="probe-platform"
            value={platform}
            onChange={(event) => setPlatform(event.target.value as ProbePlatform)}
          >
            {platforms.map((value) => (
              <option key={value} value={value}>{platformLabels[value]}</option>
            ))}
          </select>
        </div>

        <button className="probe-setup__primary" type="submit" disabled={loading || !name.trim()}>
          {loading ? 'Generating command...' : 'Generate Install Command'}
        </button>
      </form>

      {error && <p className="probe-setup__error">{error}</p>}

      {config && (
        <div className="probe-setup__result">
          <article className="probe-setup__command-card">
            <div className="probe-setup__command-header">
              <h3>Run this on your server</h3>
              <button type="button" onClick={copyCommand}>Copy Command</button>
            </div>
            <pre className="probe-setup__code" data-testid="probe-install-command">{config.install_command}</pre>
            {commandCopied && <p className="probe-setup__copied">Command copied</p>}
            <p className="probe-setup__notice">
              This command uses a node-specific credential. It never includes your master API secret.
            </p>
            <p className="probe-setup__hint">
              For security, this bootstrap command may expire. Generate a new command if it stops working.
            </p>
          </article>

          <button
            type="button"
            className="probe-setup__manual-toggle"
            aria-expanded={showManual}
            aria-controls="probe-manual-setup"
            onClick={() => setShowManual((current) => !current)}
          >
            Show Manual Setup
          </button>

          {showManual && (
            <section id="probe-manual-setup" className="probe-setup__manual" role="region" aria-label="Manual setup">
              <h3>Manual setup</h3>
              <p>Use this if the one-command installer cannot run on your server. Download the matching binary, save config.yaml beside it, then start the probe.</p>

              <dl className="probe-setup__details">
                <div>
                  <dt>Node ID</dt>
                  <dd>{config.node_id}</dd>
                </div>
                <div>
                  <dt>Probe Push URL</dt>
                  <dd>{config.probe_push_url}</dd>
                </div>
                <div>
                  <dt>Node Credential</dt>
                  <dd>{config.node_secret}</dd>
                </div>
              </dl>

              <div className="probe-setup__downloads">
                <h4>Download Probe Binary</h4>
                {selectedDownload && (
                  <a href={selectedDownload} rel="noreferrer" target="_blank">Recommended for {platformLabels[platform]}</a>
                )}
                <div className="probe-setup__download-grid">
                  {Object.entries(config.downloads).map(([key, href]) => (
                    <a key={key} href={href} rel="noreferrer" target="_blank">{key.replace('_', ' ')}</a>
                  ))}
                </div>
              </div>

              <div className="probe-setup__config-header">
                <h4>config.yaml</h4>
                <div>
                  <button type="button" onClick={copyConfig}>Copy Config</button>
                  <button type="button" onClick={downloadConfig}>Download config.yaml</button>
                </div>
              </div>
              {configCopied && <p className="probe-setup__copied">Copied config.yaml</p>}
              <pre className="probe-setup__code">{config.config_yaml}</pre>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
