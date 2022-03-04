import { AsyncMqttClient } from 'async-mqtt';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { DeyePlatform } from '../platform';
import events from 'events';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */

export class DeyeTemperatureAccessory {
  private service: Service;
  private mqttClient: AsyncMqttClient;
  private commandTopic: string;
  private deviceTimer: number;

  private deviceStates = {
    StatusActive: true,
    CurrentTemperature: 20,
  };

  constructor(
    private readonly platform: DeyePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly info: any,
  ) {
    this.deviceTimer = 120;
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Deye Technology')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, (accessory.context.device.deviceId as string).toUpperCase());

    // get the HumidifierDehumidifier service if it exists, otherwise create a new HumidifierDehumidifier service
    this.service = this.accessory.getService(this.platform.Service.TemperatureSensor)
      || this.accessory.addService(this.platform.Service.TemperatureSensor);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, 'Temperature Sensor ' + accessory.context.device.name);

    // this.service.getCharacteristic(this.platform.Characteristic.StatusActive)
    //   .onGet(this.getOn.bind(this));

    // Service Water Level
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));


    setInterval(() => {
      if (this.deviceTimer > 0) {
        this.deviceTimer--;
      }
      // this.platform.log.debug(`${accessory.context.device.name} ${this.deviceTimer.toString()}`);
    }, 1000);

    // this.platform.log.debug('============', info);
    const mqttClient = info.mqttClient as AsyncMqttClient;
    const eventer: events = info.eventer;
    const endPoint = info.mqttBaseInfo.endPoint as string;
    const productId = accessory.context.device.productId as string;
    const deviceId = accessory.context.device.deviceId as string;

    eventer.on(`${accessory.context.device.deviceId}_status`, (deviceInfo: {
      fanStatus: string;
      powerStatus: string;
      dehumidifierStatus: string;
      fanLevel: number;
      deviceMode: number;
      TargetDehumidifierValue: number;
      CurrentHumidifierValue: number;
      CurrentTemperatureValue: number;
    }) => {

      // this.platform.log.debug(JSON.stringify(deviceInfo));
      this.deviceStates.CurrentTemperature = deviceInfo.CurrentTemperatureValue;
      this.deviceTimer = 120;

      this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .updateValue(this.deviceStates.CurrentTemperature);
    });

    mqttClient.subscribe(`${endPoint}/${productId}/${deviceId}/status/hex`);
    this.commandTopic = `${endPoint}/${productId}/${deviceId}/command/hex`;
    this.mqttClient = mqttClient;
  }

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    if (this.deviceTimer > 0) {
      const CurrentTemperature = this.deviceStates.CurrentTemperature;
      this.platform.log.debug('Get Characteristic StatusActive ->', CurrentTemperature);
      this.mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
      return CurrentTemperature;
    } else {
      const CurrentTemperature = this.deviceStates.CurrentTemperature;
      this.platform.log.debug('Get Characteristic StatusActive ->', CurrentTemperature);
      this.mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
      this.platform.log.info(
        `Pull Temperature Info Timeout. Name: ${this.accessory.context.device.name} DeviceId: ${this.accessory.context.device.deviceId}`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

}
