# Homebridge Deye

将德业除湿机接入 HomeKit，并可以通过原生 iOS 家庭 App 和 Siri 进行控制。此插件理论支持大部分德业除湿机。

## 功能

- 作为除湿机设备接入 HomeKit

- 环境温湿度显示

- 除湿机水量显示

- 除湿机目标湿度调节

- 设置除湿机的模式。睡眠，手动和干衣

- 控制风扇速度（部分机型不支持此功能）

- 童锁（物理按键锁定）

- HomeKit 自动化

## 支持的设备

以下的设备已经测试。

- Deye DYD-D50A3 (触摸面板版本) [链接](http://www.deye.cn/new/2020/04/14/%E5%AE%B6%E7%94%A8%E9%99%A4%E6%B9%BF%E6%9C%BAdyd-d50a3/)

- Deye DYD-E12A3 [链接](http://www.deye.cn/new/2020/04/15/%e5%ae%b6%e7%94%a8%e9%99%a4%e6%b9%bf%e6%9c%badyd-e12a3/)

## 截图

## 安装

如果您是 Homebridge 的新手，请按照[此处的文档](https://github.com/homebridge/homebridge/wiki)完成 Homebridge 和 Homebridge Config UI X 的安装。

安装除湿机插件

```
sudo npm install -g homebridge-deye
```

## 配置

在 `.homebridge` 内的主目录中的 `config.json` 中添加 `DEYE` 平台。

示例配置

```
{
    "platforms": [
        {
            "platform": "DEYE"
            "mqttBaseInfo": {
                "mqttHost": "yourmqtthost.com",
                "mqttPort": "1883",
                "endPoint": "b374fbd89bba44b28399d975fc82d8f5",
                "username": "b374fbd89bba44b28399d975fc82d8f5/9c2056e3f115459e9c88394217ee52fc",
                "password": "9c2056e3f115459e",
                "clientId": "app_34bc46389bc011ecb9090242ac120002"
            },
            "devices": [
                {
                    "name": "DYD-D50A3",
                    "model": "DYD-D50A3",
                    "productId": "97e85d3856c54a1ab090c8541101a050",
                    "deviceId": "5111127c8d6f4beca10861dfc5942949",
                    "fanControl": true,
                    "temperatureSensor": true,
                    "dryClothes": true,
                    "sleepMode": true
                }
            ]
        }
    ]
}
```

### 平台配置字段

`platform` [必填] 应为 “DEYE”。

### 服务器连接配置字段 `mqttBaseInfo`

`mqttHost` [必填] MQTT 服务器地址。

`mqttPort` [必填] MQTT 服务器端口。

`endPoint` [必填] MQTT endPoint。

`username` [必填] MQTT 用户名。

`password` [必填] MQTT 密码。

`clientId` [必填] MQTT 客户端 ID。

### 设备连接配置字段 `devices`

`name` [必填] 自定义的配件名称。

`model` [必填] 设备型号。例如 `DYD-D50A3`

`productId` [必填] 你获取到的 productId。

`deviceId` [必填] 你获取到的 deviceId。

`fanControl` [必填] 是否启用风速控制功能。仅部分机型支持。

`temperatureSensor` [必填] 是否启用温度传感器。可能仅部分机型支持。

**请注意：当启用温度传感器后，由于苹果 HomeKit 政策原因，它将会将配件进行合并，你可能无法直接看到加湿器的控制界面。**

如果发生此情况，请点击家庭 App 中配件中的“配件”选项，你将可以看到除湿机的信息。
或者，你也可以选择启用 干衣模式 或 睡眠模式，然后在点击家庭 App 中配件的“作为单独板块分开显示”。

`dryClothes` [必填] 是否启用干衣模式开关。可能仅部分机型支持。

`sleepMode` [必填] 是否启用睡眠模式开关。可能仅部分机型支持。

## 特别感谢

[@yamisenyuki](https://github.com/yamisenyuki) - 编写代码

[HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) 和 [homebridge](https://github.com/nfarina/homebridge) - 使这成为可能.
