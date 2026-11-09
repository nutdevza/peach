import { expect, it, vi } from 'vitest';
import { PortSettings } from '../../src/react/settings/port-settings';
import type { ConfigurationData } from '../../src/react/bundle';
import { click, fetchMock, mount, sentBody, settle, submit, type } from './render';
const data: ConfigurationData = { editable: true, notice: '', revision: 'rev-1',
  media_dirs: ['D:\\Media'], media_sources: [{ location: 'local', root: 'D:\\Media', path: 'D:\\Media' }],
  library_count: 1, port: 9123, facts: [] };
it('Saving the port keeps saved media folders and source mappings', async () => {
  const fetcher = fetchMock(200, { saved: true, revision: 'rev-2', url: 'http://127.0.0.1:9124/' });
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<PortSettings data={data} receipt={receipt} />);
  await type(host.querySelector<HTMLInputElement>('#configPort'), '9124');
  await submit(host.querySelector('form'));
  await settle();
  expect(sentBody(fetcher)).toEqual({ revision: 'rev-1', media_dirs: data.media_dirs,
    media_sources: data.media_sources, port: '9124', scan_now: false });
  expect(receipt).toHaveBeenCalledWith('Configuration saved');
  expect(host.querySelector('a')?.getAttribute('href')).toBe('http://127.0.0.1:9124/settings/network');
});

it('LAN and fallback addresses copy separately, and a failed copy can still select the text', async () => {
  const copy = vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copy } });
  const host = await mount(<PortSettings data={{ ...data, network: {
    editable: true, host: '0.0.0.0', mdns_name: 'peach', scope: 'lan',
    local_url: 'http://127.0.0.1:9123/', lan_url: 'http://peach.local:9123/', ip_url: 'http://192.0.2.10:9123/',
  } }} receipt={vi.fn()} />);
  const inputs = [...host.querySelectorAll<HTMLInputElement>('input[readonly]')];
  expect(inputs.map(input => input.value)).toEqual([
    'http://127.0.0.1:9123/', 'http://peach.local:9123/', 'http://192.0.2.10:9123/',
  ]);
  const copyButtons = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(button => button.textContent === 'Copy address');
  await click(copyButtons[1]); await settle();
  expect(copy).toHaveBeenCalledWith('http://peach.local:9123/');
  expect(host.textContent).toContain('Access addressLocal addressCopy addressPhone connection addressCopy addressCopy failed; select the address and copy it.Fallback IP addressCopy addressPhone and computer on the same Wi-Fi.If the hostname does not open, try the fallback IP address.Who can accessDevices on the same LANThis computer onlyLAN access addresshttp://.localPortlocalhost:Peach will restart after saving and jump to the new address.Save configuration');
});

it('Local mode hides the phone address and saves the access range', async () => {
  const fetcher = fetchMock(200, { saved: true, url: 'http://127.0.0.1:9123/' });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<PortSettings data={{ ...data, network: {
    editable: true, host: '127.0.0.1', mdns_name: 'peach', scope: 'local',
    local_url: 'http://127.0.0.1:9123/', lan_url: '', ip_url: '',
  } }} receipt={vi.fn()} />);
  expect(host.textContent).toContain('Only this computer may access for now');
  expect(host.querySelector('#configMdnsName')).toBeNull();
  await submit(host.querySelector('form')); await settle();
  expect(sentBody(fetcher).host).toBe('127.0.0.1');
  expect(sentBody(fetcher)).not.toHaveProperty('mdns_name');
});
it('Failed port validation keeps input, with the error beside the field', async () => {
  vi.stubGlobal('fetch', fetchMock(400, { errors: { port: 'The port range is invalid' } }));
  const receipt = vi.fn();
  const host = await mount(<PortSettings data={data} receipt={receipt} />);
  await type(host.querySelector<HTMLInputElement>('#configPort'), '1');
  await submit(host.querySelector('form')); await settle();
  expect(host.querySelector('#configPort')?.getAttribute('aria-invalid')).toBe('true');
  expect(host.textContent).toContain('The port range is invalid');
  expect(host.querySelector<HTMLInputElement>('#configPort')?.value).toBe('1');
  expect(receipt).not.toHaveBeenCalled();
});

it('Switching from this machine to LAN allows naming, and saving submits the full network configuration', async () => {
  const fetcher = fetchMock(200, { saved: true, url: 'http://127.0.0.1:9123/' });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<PortSettings data={{ ...data, network: {
    editable: true, host: '127.0.0.1', mdns_name: 'peach', scope: 'local',
    local_url: 'http://127.0.0.1:9123/', lan_url: '', ip_url: '',
  } }} receipt={vi.fn()} />);
  await click(host.querySelector('input[type="radio"][value="0.0.0.0"]'));
  await type(host.querySelector<HTMLInputElement>('#configMdnsName'), 'peach-phone');
  expect(host.textContent).toContain('http://');
  expect(host.textContent).toContain('.local');
  expect(host.textContent).toContain('Access addressLocal addressCopy addressOnly this computer may access for now, so phones cannot connect.Who can accessDevices on the same LANThis computer onlyLAN access addresshttp://.localPortlocalhost:After saving and restarting, the phone connection address shows. Set an access password below.Peach will restart after saving and jump to the new address.Save configuration');
  await submit(host.querySelector('form')); await settle();
  expect(sentBody(fetcher)).toMatchObject({ host: '0.0.0.0', mdns_name: 'peach-phone', port: '9123' });
});

it('Service-managed network settings show the address only', async () => {
  const host = await mount(<PortSettings data={{ ...data, network: {
    editable: false, host: '0.0.0.0', mdns_name: 'peach', scope: 'lan',
    local_url: 'https://peach.local/', lan_url: 'https://peach.local/', ip_url: '',
  } }} receipt={vi.fn()} />);
  expect(host.querySelector('form')).toBeNull();
  expect(host.querySelector('#configPort')).toBeNull();
  expect(host.textContent).toContain('Access range, name, and port are managed by the service startup configuration.');
});
