import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, Categories } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { DeyeDehumidifierAccessory } from './devices/dehumidifier';
import { DeyeTemperatureAccessory } from './devices/temperatureSensor';
import MQTT, { IPublishPacket } from 'async-mqtt';
import events from 'events';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class DeyePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', 'homebridge-deye');

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    // run the method to discover / register your devices as accessories
    try {
      const mqttBaseInfo = this.config.mqttBaseInfo;
      const devices = this.config.devices;
      let mqttClient;
      const eventer = new events.EventEmitter();
      if (devices.length > 0) {
        mqttClient = await MQTT.connectAsync(`mqtt://${mqttBaseInfo.mqttHost}:${mqttBaseInfo.mqttPort}`, {
          username: mqttBaseInfo.username,
          password: mqttBaseInfo.password,
          clientId: mqttBaseInfo.clientId,
        });

        this.log.info('Starting Pull devices status');

        mqttClient.handleMessage = async (packet, callback) => {
          this.log.debug('handleMessage', packet);
          // console.log(packet)
          if (packet.cmd === 'publish') {
            const message = packet as IPublishPacket;
            const topic = (message.topic as string).split('/');
            const payload = message.payload as Buffer;
            if (topic[3] === 'status') {
              const json = JSON.parse(payload.toString());
              const data = json.data;
              const fanStatus = data[4];
              const powerStatus = data[5];
              const dehumidifierStatus = data[7];
              const fanLevel = data[8];
              const deviceMode = data[9];
              const TargetDehumidifierValue = parseInt(`${data[10]}${data[11]}`, 16);
              const CurrentHumidifierValue = parseInt(`${data[32]}${data[33]}`, 16);
              const CurrentTemperatureValue = (parseInt(`${data[30]}${data[31]}`, 16)) - 40;
              eventer.emit(`${topic[2]}_status`, {
                fanStatus, powerStatus, dehumidifierStatus, fanLevel, deviceMode,
                TargetDehumidifierValue, CurrentHumidifierValue, CurrentTemperatureValue,
              });
            }
          }
          callback();
        };
      }

      // loop over the discovered devices and register each one if it has not already been registered
      for (const device of devices) {

        // generate a unique id for the accessory this should be generated from
        // something globally unique.
        const uuid = this.api.hap.uuid.generate(device.deviceId);

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // the accessory already exists
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

          // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
          existingAccessory.category = Categories.AIR_DEHUMIDIFIER;
          existingAccessory.displayName = device.name;

          existingAccessory.context.device = device;
          const info = { mqttClient, device, mqttBaseInfo, eventer };
          this.api.updatePlatformAccessories([existingAccessory]);
          new DeyeDehumidifierAccessory(this, existingAccessory, info);
          if (device.temperatureSensor) {
            new DeyeTemperatureAccessory(this, existingAccessory, info);
          }
          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          // new ExamplePlatformAccessory(this, existingAccessory);
          // this.api.updatePlatformAccessories([existingAccessory]);
          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
          // remove platform accessories when no longer present
          // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
        } else {
          // the accessory does not yet exist, so we need to create it
          this.log.info('Adding new accessory:', device.name);

          // create a new accessory
          const accessory = new this.api.platformAccessory(device.name, uuid, Categories.AIR_DEHUMIDIFIER);

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = device;

          const info = { mqttClient, device, mqttBaseInfo, eventer };

          // create the accessory handler for the newly create accessory
          // this is imported from `platformAccessory.ts`
          new DeyeDehumidifierAccessory(this, accessory, info);
          if (accessory.context.device.temperatureSensor) {
            new DeyeTemperatureAccessory(this, accessory, info);
          }

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    } catch (err) {
      this.log.error('Failed to discover devices:', (<any>err).message);
      this.log.debug('Failed to discover devices:', err);
    }
  }
}
