import { AsyncMqttClient } from 'async-mqtt';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { DeyePlatform } from '../platform';
import events from 'events';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */

export class DeyeDehumidifierAccessory {
  private service: Service;
  private mqttClient: AsyncMqttClient;
  private commandTopic: string;
  private fanTimer;
  private deviceTimer: number;
  private sleepService;
  private dryCloService;

  private deviceStates = {
    Active: this.platform.Characteristic.Active.ACTIVE,
    FanSpeed: 1,
    CurrentHumidifierDehumidifierState: this.platform.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING,
    sleepMode: false,
    dryCloMode: false,
    TargetHumidifierDehumidifierState: this.platform.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER,
    CurrentRelativeHumidity: 60,
    RelativeHumidityDehumidifierThreshold: 60,
    WaterLevel: 0,
    LockPhysicalControls: 0,
  };

  getDeviceStates() {
    let devicePower;
    let deviceFan;
    if (this.deviceStates.Active === 1) {
      devicePower = 0b0011;
    } else {
      devicePower = 0b0010;
    }
    if (this.deviceStates.LockPhysicalControls === 1) {
      devicePower = devicePower ^ 0b0100;
    }

    if (this.deviceStates.FanSpeed === 1) {
      deviceFan = 0b00010000;
    } else if (this.deviceStates.FanSpeed === 2) {
      deviceFan = 0b00100000;
    } else if (this.deviceStates.FanSpeed === 3) {
      deviceFan = 0b00110000;
    }

    if (this.deviceStates.dryCloMode) {
      deviceFan = deviceFan ^ 0b00000001;
    } else if (this.deviceStates.sleepMode) {
      deviceFan = deviceFan ^ 0b00000110;
    }
    const buffer = Buffer.from([0x08, 0x02, devicePower, deviceFan,
      this.deviceStates.RelativeHumidityDehumidifierThreshold, 0, 0, 0, 0, 0]);
    this.platform.log.debug('Device Control Code ' + buffer.toString('hex'));
    return buffer;
  }

  constructor(
    private readonly platform: DeyePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly info: any,
  ) {
    this.fanTimer = null;
    this.deviceTimer = 120;
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Deye Technology')
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, (accessory.context.device.deviceId as string).toUpperCase());

    // get the HumidifierDehumidifier service if it exists, otherwise create a new HumidifierDehumidifier service
    this.service = this.accessory.getService(this.platform.Service.HumidifierDehumidifier)
      || this.accessory.addService(this.platform.Service.HumidifierDehumidifier);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // Service dryClothes
    if (accessory.context.device.dryClothes) {
      this.dryCloService = this.accessory.getService('Dry Clothes Mode ' + accessory.context.device.name) ||
        this.accessory.addService(this.platform.Service.Switch,
          'Dry Clothes Mode ' + accessory.context.device.name, accessory.context.device.deviceId);
      this.dryCloService.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setDryCloMode.bind(this))
        .onGet(this.getDryCloMode.bind(this));
    } else {
      this.dryCloService = null;
    }
    // Service Sleep Mode
    if (accessory.context.device.sleepMode) {
      this.sleepService = this.accessory.getService('Sleep Mode ' + accessory.context.device.name) ||
        this.accessory.addService(this.platform.Service.Switch,
          'Sleep Mode ' + accessory.context.device.name, accessory.context.device.deviceId + 'S');
      this.sleepService.getCharacteristic(this.platform.Characteristic.On)
        .onSet(this.setSleepMode.bind(this))
        .onGet(this.getSleepMode.bind(this));
    } else {
      this.sleepService = null;
    }

    // Service Current Active Status
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getOn.bind(this))
      .onSet(this.setOn.bind(this));

    // Service Current Relative Humidity
    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getCurrentRelativeHumidity.bind(this));

    // Service Dehumidifier RotationSpeed
    // console.log(accessory.context.device.fanControl)
    if (accessory.context.device.fanControl) {
      this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
        .setProps({
          minValue: 0,
          maxValue: 3,
          minStep: 1,
        })
        .onGet(this.getFan.bind(this))
        .onSet(this.setFan.bind(this));
    }

    // Service Target Dehumidifier State
    this.service.getCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState)
      .setProps({
        validValues: [2],
      })
      .onSet(this.setHumidifierDehumidifierState.bind(this))
      .onGet(this.getHumidifierDehumidifierState.bind(this));

    // Service Current Dehumidifier State
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState)
      .setProps({
        validValues: [
          this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE,
          this.platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE,
          this.platform.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING,
        ],
      })
      .onGet(this.getCurrentHumidifierDehumidifierState.bind(this));

    // Service Relative Dehumidifier Threshold
    this.service.getCharacteristic(this.platform.Characteristic.RelativeHumidityDehumidifierThreshold)
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 1,
      })
      .onGet(this.getRelativeHumidityDehumidifierThreshold.bind(this))
      .onSet(this.setRelativeHumidityDehumidifierThreshold.bind(this));

    // Service Water Level
    this.service.getCharacteristic(this.platform.Characteristic.WaterLevel)
      .onGet(this.getWaterLevel.bind(this));

    // Service Lock Physical Controls
    this.service.getCharacteristic(this.platform.Characteristic.LockPhysicalControls)
      .onGet(this.getLockPhysicalControls.bind(this))
      .onSet(this.setLockPhysicalControls.bind(this));

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

      this.platform.log.debug('Device Info ========== ' + this.accessory.context.device.name + JSON.stringify(deviceInfo));

      this.deviceStates.FanSpeed = deviceInfo.fanLevel;

      if (deviceInfo.fanStatus === '8') {
        this.deviceStates.WaterLevel = 0;
      } else if (deviceInfo.fanStatus === '0') {
        this.deviceStates.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
        this.deviceStates.WaterLevel = 0;
      } else if (deviceInfo.fanStatus === '4') {
        this.deviceStates.WaterLevel = 100;
        this.deviceStates.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
      }

      if (deviceInfo.deviceMode === 0) {
        this.deviceStates.dryCloMode = false;
        this.deviceStates.sleepMode = false;
      } else if (deviceInfo.deviceMode === 1) {
        this.deviceStates.dryCloMode = true;
        this.deviceStates.sleepMode = false;
      } else if (deviceInfo.deviceMode === 6) {
        this.deviceStates.sleepMode = true;
      }

      if (deviceInfo.powerStatus === '3' || deviceInfo.powerStatus === 'B' || deviceInfo.powerStatus === '7') {
        this.deviceStates.Active = this.platform.Characteristic.Active.ACTIVE;
      } else {
        this.deviceStates.Active = this.platform.Characteristic.Active.INACTIVE;
      }

      if (deviceInfo.powerStatus === '6' || deviceInfo.powerStatus === '7') {
        this.deviceStates.LockPhysicalControls = 1;
      }

      if (deviceInfo.dehumidifierStatus === '8') {
        this.deviceStates.CurrentHumidifierDehumidifierState =
          this.platform.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING;
      } else {
        this.deviceStates.CurrentHumidifierDehumidifierState = this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
      }

      this.deviceStates.RelativeHumidityDehumidifierThreshold = deviceInfo.TargetDehumidifierValue;
      this.deviceStates.CurrentRelativeHumidity = deviceInfo.CurrentHumidifierValue;

      // this.deviceStates.CurrentTemperature = deviceInfo.CurrentTemperatureValue;

      this.deviceTimer = 120;

      this.service.getCharacteristic(this.platform.Characteristic.Active)
        .updateValue(this.deviceStates.Active);
      this.service.getCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState)
        .updateValue(this.deviceStates.CurrentHumidifierDehumidifierState);
      this.service.getCharacteristic(this.platform.Characteristic.RelativeHumidityDehumidifierThreshold)
        .updateValue(this.deviceStates.RelativeHumidityDehumidifierThreshold);
      this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .updateValue(this.deviceStates.CurrentRelativeHumidity);
      this.service.getCharacteristic(this.platform.Characteristic.WaterLevel)
        .updateValue(this.deviceStates.WaterLevel);
      if (accessory.context.device.fanControl) {
        this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
          .updateValue(this.deviceStates.FanSpeed);
      }
      if (accessory.context.device.dryClothes && this.dryCloService) {
        this.dryCloService.updateCharacteristic(this.platform.Characteristic.On,
          this.deviceStates.dryCloMode);
      }
      if (accessory.context.device.sleepMode && this.sleepService) {
        this.dryCloService.updateCharacteristic(this.platform.Characteristic.On,
          this.deviceStates.sleepMode);
      }
    });

    mqttClient.subscribe(`${endPoint}/${productId}/${deviceId}/status/hex`);
    this.commandTopic = `${endPoint}/${productId}/${deviceId}/command/hex`;
    this.mqttClient = mqttClient;
    mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
    setInterval(() => {
      mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
      this.platform.log.info(`Getting ${accessory.context.device.name} Status...`);
    }, 60000);
  }

  async getDryCloMode(): Promise<CharacteristicValue> {
    if (this.deviceTimer > 0) {
      const CurrentdryCloMode = this.deviceStates.dryCloMode;
      this.platform.log.debug('Get Characteristic Active ->', CurrentdryCloMode);
      this.mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
      return CurrentdryCloMode;
    } else {
      const CurrentdryCloMode = this.deviceStates.dryCloMode;
      this.platform.log.debug('Get Characteristic Active ->', CurrentdryCloMode);
      this.mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
      // this.platform.log.info(
      //   `Pull Device Info Timeout. Name: ${this.accessory.context.device.name} DeviceId: ${this.accessory.context.device.deviceId}`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setDryCloMode(value: CharacteristicValue) {
    this.deviceStates.dryCloMode = value as boolean;
    this.mqttClient.publish(this.commandTopic, this.getDeviceStates());
    this.dryCloService.updateCharacteristic(this.platform.Characteristic.On, value);
    this.platform.log.debug('Set Characteristic dryCloMode -> ', value);
  }

  async getSleepMode(): Promise<CharacteristicValue> {
    if (this.deviceTimer > 0) {
      const CurrentSleepMode = this.deviceStates.sleepMode;
      this.platform.log.debug('Get Characteristic Active ->', CurrentSleepMode);
      this.mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
      return CurrentSleepMode;
    } else {
      const CurrentSleepMode = this.deviceStates.Active;
      this.platform.log.debug('Get Characteristic Active ->', CurrentSleepMode);
      this.mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
      // this.platform.log.info(
      //   `Pull Device Info Timeout. Name: ${this.accessory.context.device.name} DeviceId: ${this.accessory.context.device.deviceId}`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async setSleepMode(value: CharacteristicValue) {
    this.deviceStates.sleepMode = value as boolean;
    this.mqttClient.publish(this.commandTopic, this.getDeviceStates());
    this.dryCloService.updateCharacteristic(this.platform.Characteristic.On, value);
    this.platform.log.debug('Set Characteristic sleepMode -> ', value);
  }

  async setOn(value: CharacteristicValue) {
    if (value !== this.deviceStates.Active) {
      this.deviceStates.Active = value as number;
      this.mqttClient.publish(this.commandTopic, this.getDeviceStates());
      this.platform.log.debug('Set Characteristic Active ->', value);
    }
    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .updateValue(this.deviceStates.Active);
  }

  // if you need to return an error to show the device as "Not Responding" in the Home app:
  // throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

  async getOn(): Promise<CharacteristicValue> {
    if (this.deviceTimer > 0) {
      const isOn = this.deviceStates.Active;
      this.platform.log.debug('Get Characteristic Active ->', isOn);
      this.mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
      return isOn;
    } else {
      const isOn = this.deviceStates.Active;
      this.platform.log.debug('Get Characteristic Active ->', isOn);
      this.mqttClient.publish(this.commandTopic, Buffer.from([0, 1]));
      this.platform.log.info(
        `Pull Device Info Timeout. Name: ${this.accessory.context.device.name} DeviceId: ${this.accessory.context.device.deviceId}`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async getFan(): Promise<CharacteristicValue> {
    const isFabOn = this.deviceStates.FanSpeed;
    this.platform.log.debug('Get Characteristic Fan ->', isFabOn);
    return isFabOn;
  }

  async setFan(value: CharacteristicValue) {
    if (this.fanTimer) {
      clearTimeout(this.fanTimer);
    }
    this.fanTimer = setTimeout(() => {
      this.deviceStates.FanSpeed = value as number;
      this.mqttClient.publish(this.commandTopic, this.getDeviceStates());
      this.platform.log.debug('Set Characteristic Fan ->', value);
    }, 500);
    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .updateValue(this.deviceStates.FanSpeed);
  }

  async setHumidifierDehumidifierState(value: CharacteristicValue) {
    this.deviceStates.TargetHumidifierDehumidifierState = value as number;
    this.mqttClient.publish(this.commandTopic, this.getDeviceStates());
    this.service.getCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState)
      .updateValue(this.deviceStates.TargetHumidifierDehumidifierState);
    this.platform.log.debug('Set Characteristic HumidifierDehumidifierState -> ', value);
  }

  async getHumidifierDehumidifierState(): Promise<CharacteristicValue> {
    const HumidifierDehumidifierState = this.deviceStates.TargetHumidifierDehumidifierState;
    this.platform.log.debug('Get Characteristic HumidifierDehumidifierState -> ', HumidifierDehumidifierState);
    return HumidifierDehumidifierState;
  }

  async getCurrentHumidifierDehumidifierState(): Promise<CharacteristicValue> {
    const currentValue = this.deviceStates.CurrentHumidifierDehumidifierState;
    return currentValue;
  }

  async getCurrentRelativeHumidity(): Promise<CharacteristicValue> {
    const CurrentRelativeHumidity = this.deviceStates.CurrentRelativeHumidity;
    return CurrentRelativeHumidity;
  }

  async getRelativeHumidityDehumidifierThreshold(): Promise<CharacteristicValue> {
    const RelativeHumidityDehumidifierThreshold = this.deviceStates.RelativeHumidityDehumidifierThreshold;
    return RelativeHumidityDehumidifierThreshold;
  }

  async setRelativeHumidityDehumidifierThreshold(value: CharacteristicValue) {
    if (value >= 25 && value <= 80) {
      this.deviceStates.RelativeHumidityDehumidifierThreshold = value as number;
    } else if (value < 25) {
      this.deviceStates.RelativeHumidityDehumidifierThreshold = 25;
    } else if (value > 80) {
      this.deviceStates.RelativeHumidityDehumidifierThreshold = 80;
    }
    this.service.getCharacteristic(this.platform.Characteristic.RelativeHumidityDehumidifierThreshold)
      .updateValue(this.deviceStates.RelativeHumidityDehumidifierThreshold);
    this.mqttClient.publish(this.commandTopic, this.getDeviceStates());
    this.platform.log.debug('Set Characteristic RelativeHumidityDehumidifierThreshold -> ', value);
  }

  async getWaterLevel(): Promise<CharacteristicValue> {
    const WaterLevel = this.deviceStates.WaterLevel;
    this.platform.log.debug('Get Characteristic WaterLevel -> ', WaterLevel);
    return WaterLevel;
  }

  async getLockPhysicalControls(): Promise<CharacteristicValue> {
    const LockPhysicalControls = this.deviceStates.LockPhysicalControls;
    return LockPhysicalControls;
  }

  async setLockPhysicalControls(value: CharacteristicValue) {
    this.deviceStates.LockPhysicalControls = value as number;
    this.mqttClient.publish(this.commandTopic, this.getDeviceStates());
    this.service.getCharacteristic(this.platform.Characteristic.LockPhysicalControls)
      .updateValue(this.deviceStates.LockPhysicalControls);
    this.platform.log.debug('Set Characteristic LockPhysicalControls -> ', value);
  }

}
