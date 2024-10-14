# Netbox Docker Agent

[![Code](https://img.shields.io/badge/code-nodered-aa4444?logo=data%3Aimage%2Fpng%3Bbase64%2CiVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAAllBMVEWPAAD%2F%2F%2F%2BHAACMAACKAADo2dmFAACycnLm1dX79PTWrq6ZNDSeOjqnWVnw5ubInp7WtbWUGxvPq6u4f3%2B6hIS0d3fCkpLLpKTav7%2Ft4OCtZmbHm5ukUFCQCgqyZmaZKyvjyMi2b2%2Fjx8fcu7ulR0fGj4%2B8iIioTk7AhISYISHq0dGYLS2VGBiuW1usZWV9AACfPz%2BXExNKj0VlAAAKtklEQVR4nO2d53riOhCGZUkYTLKGnAQSrxO6lxJIwv3f3LE0kiwbV9Iwz3y%2FNi5Cr8qMyshLCAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUCoVCoVAoFAqFQqFQKBQKhUKhUCgUSohxVinOfjuXnxB%2FfvKdCvnLFf%2FtfJ6vZRUeqN%2FWWmS7eoCOM6O%2FndezRPt1AR0nbGNDZdP6gI5z99vZPUN8ILM%2BPPwp1QH6atTCSqQ9kfMFrXIWdNfWnkg9kfOHSjPJQ%2FGc3zJCxil9l4T%2FrpGQUTIPlx1w9VdIyNjcdoPXR8jXQcoLXB0h3WT83LUR0ijrya%2BMkM812Gwwur1CW8ruAM%2FbEMqZC4SVY5U2EdKZBOzsJRWMVXaUVymAsc9v576G2EQC%2Bi%2FQMKFunM6gQmB7o1%2BYIrLKws9mCnz8rbmctTpl%2BmG4WJxMon65wu7W7mQc7Ghomhsf1wfc%2FPjUgm4q11dieQMrY0dpWTzrCqu5iOE4%2FZ8HfKqZtQ7RbVLN6Od20%2BVZ%2F19QUKOfB6y%2F%2FrBTRBzMTC%2FdNzmJFoFfqmC5IT8OyA61AeMeJJn4h2yjzjprfRit1C9YUQ6Tg2BYLvB%2BQVwBzJ0AYL8NXi3WVmZ36FY4C3cuqV7Y3bwD9Rm0BJCtZXb31SNK6ax7HWMxji1ZTmLPUDeVD9L0VNBZbA5iQPoDWfykziYU6gxWl7%2FV8ilC0Vj7K3bZjJ8lFDU5umjGhoTBYrYLTsZ4fvc3%2FFxNNSSMwKuQ6SRc2qDB5W4LNiQcKxAmloFf5v2EMiQXWo2KsPpBRZjCYJQczLA9uLnMamQfMnvrqtwxIsc%2B3ZOhKH8106bJhY5yZEPz1vu7Mu2nCwmxPW2KjN7qgU7prhlj%2B5tyvZJvca78UTm2cinHkIvA1CpNPLwtzCFj3Z1X5G%2BMTV5WtqVzdFf5w4kmBQT8oBLZFbhGtq%2B5zf8dE5YGE8RBYQmzo7Kqfq69Yds66yRST9%2BAaCqgSlHJjzMyU091czpT%2FUCN79kCZ%2FuwcEhm5C8%2FykuX6dWQp232QbW4Wk%2Fet8QxcPJ6W66bl0o7Z7aivAFJj%2BIoGOLwpvwnPuCxE4%2F0RaoIMaiTBF2b5r5cx5bfvAS7%2FKFbkQpzZVMaXubIQYodF0mrXoyet4SKnQzmyitv1esIQ%2FHc7kIHDlKMj2yr5fnBUz%2BMNiP519%2BahL1LJhQ2NXQKdCWEcTbZON%2F5XQ2hYJwMcyCviFD0R7LaLIIrJiRyjszI9PDvsT9cLq%2BSUEoEdnNO3xt5i1YRKlFJOK%2F05LDP18rIRVinYxWBDPRVlkQbQ4jVLNur2N9SyyGHC13SKlOjGOleCwFNYEMtfbSSkPDaW%2BmTFvZCKTqvtZDQu20roBiSz%2Fu9cs3Cw8Xv1ZVKbASUq918KBQKhUJ9n6qDAVsu0rl2NYofb6WQsP1CwvYLCZvJ1ya696XJfkpfS9h1lZt9%2F9JkP6WvJbzXiwjulyZbJq9qfcoQdl0ts3H37CaqVykjHUHRiNB%2Fd21Rsp8Mkt3DXvqukcj5Q%2Fw0TV5k%2B7%2BDk21HQ2iKP4lwsrd6aK28Lucf5xCebKQwzuY6q0UbSWIVfHwa6Ji8eEJolhm5Dob8Y71fO8uQ3WaEbg4AIyoqo5d3VxHmHarlmQ%2F5GMJwq0N02VY17c2dusTI9rZudr3mhN6r%2BSE79Iaq00ZTc1glFZsjCB%2BTTNsvpkIdLEvj63iwZI%2FAl6GE7F%2FtqLmzCAWG3N5lH5NYfz4gq%2FoktOMFcAJspT%2Fh8qYJ43vwrZAb8eJkpY61pQ7T2bbUHFxkZv98JN7n%2FzXI63mEYAb0D3Xg6Cw10UOyv%2FCZefpoCJ1HLusA%2FvA30Gm5VSX5hGt96YcJH3UiU1mlc30XCJNznOJ2ivBB31nyNEABIaG6s54Ser1BNI4GJ%2BG6wSCKRIDiKaG3CMfjqF%2Fe0tOEkBVmOn%2BWcBU7iZdcQvib8GRQlU9ItLHJEnrRlnLOOKf7jc3YeZaX6cTPEsL3BES4wXrhFCtDGBhjkksYiG2YfEI4HG4duD0llN1cG5sM4c46js33Sb940maMkV2acLc3bzA%2Bqk9ISgktnRDChVUxIQuhDwQ5hOkYbMZ1pXROnLIm3KU2g2gxYoZwl85mE8IO%2FKLpFDmEshZUX00ReuB8GOVqcMZUMq9wnVPK04T6Da6O4NFhTcK53ZBObWkZocfsrOURjiGeHoxNihDi7Pl8F%2FRGtsmCgFU27Qe9SHlgRage2wTBUpaCGUwUEOqihC8KUPOwJGTGHz5bo5YTQji9kxyUyyP05TPHLGEAVgrKGWL%2BYdgBwR2QeX9vEUJCcJbCgx8u2o2XhOxtEIZhdIC%2B6yYVDuPH5Itmj8mLZxFCxI00RzbhJtU3DsZjKQ5VroFlaWQ67MZOvSgi%2FV41ZxEQDP%2B0h5f2CDnVms8ldG5k9jtpQhnEYUIiwLWKGCSIsWLquu0tZCno4zDq5LZ8t2ukz3XfpxniDmC3568n3InxvDiUZhFCVTF9Qgn%2BJIGuqY9TQm%2BftORY0K7Fv8Lky3ruLJ%2BQHCdW6CUQcjNZHXyaEGxZbPksQnDCL6Zop%2FJHe%2BozCUw7ApsQcn18kToSc8OKO9P8VitV33lhLLGdTbyFIiy1pY62C8QmBKd3Z56%2BkQn1tBnUMxabMGfuWkrINrtYs6X6HghP29KvJYQXefSQJdwmhLKaZyeD5hqEY9fsDL3brdQk8gStsnsOYR1%2FKCWHd8dbkhDKgt%2Bbp1%2Fr1iG1V1fkes%2Fpob2sx4da3uu7TQh36VeLCa1TGaofwh%2B6bMCMCMMD%2FdAc6LEIU%2B2wXBlCZdb0DKEJIWQnOU5XSGgF5AKht5U%2FqvMLwz9xpA5sqZ6R2YTTlH9pQqhmCPrHsoT90f39Qz6hL49c88TaFhN6mTp0nlNjxdD4%2F0Xi6NKEYJGtYX4DwpXu5bmEB8r4XT6hOsKZeNNiwuQwpiKEyRV830nVqCwqNaZRVQWDVCBcUvtOrOIjfM0IV4VzfGh59veYbMIhzC3M3%2FoLQIoQKpWtBKIH95jEVUHHci41hmJRI%2B8p2EQVwrw40MKJvmW0E0KuR6Zv8JexTqJ4U4T30noFgxcY6m%2BtlA2h1%2BnDUHMV7lRR99KEqlIZ%2BTuawxRCLdvBAI7wj%2B5f%2FckZHs0EvDqwSrfx%2BOzPMW5a%2BV8sC2ahNNps3e%2Bp5gV5uRGLJcEimkKiSfSBIvR6A%2BtDTExN3hix20qyIqwjF8U0T11TH9UyRXtQKaiJMNfWRf2KvK5Lxb0Xd9TaF9GLmbmHon0zr2TcVWUAB4aZO3B6yawzJUEYuXkHaknHTv10VZ9YaxDpOoxRbB9OjQnxku890NGzwr2HQkqdBeUsb9vNXtXXZkAlyQfNVvVFRWYOJVt1mBz3dPUzQ3mRJt1jTExNMyu23F9RNf0fOV1IiN6rJLZ6QYBRMsrth75rfcxat%2BMFEenQmNC6a0vY0n%2BZj2NzSg7Z9S5D%2BN88mdK8mdsPcoZjveSHz3F%2F4GQdpTM7%2FENU8n1IaK6LxetPtvGImrzOixYUvb%2FWbMpMe73%2BKP7zyQmsu7ZECQ7n6WtRzv%2BtcMb%2BoT3Yylxu9sbPCPfx2y8kbL%2BQsP1CwvYLCduv6yf8H6gkze7yS1oWAAAAAElFTkSuQmCC)](https://nodered.org/)
[![Github Issues](http://img.shields.io/github/issues/SaaShup/netbox-docker-agent?color=blue)](https://github.com/SaaShup/netbox-docker-agent/issues)
[![Github Pull requests](https://img.shields.io/github/issues-pr/SaaShup/netbox-docker-agent?color=green)](https://github.com/SaaShup/netbox-docker-agent/pulls)
[![MIT license](http://img.shields.io/badge/license-MIT-brightgreen.svg)](http://opensource.org/licenses/MIT)

## Description

Agent to install on the docker server to manage containers though [netbox plugin](https://github.com/SaaShup/netbox-docker-plugin).
![netbox-docker-agent](https://github.com/SaaShup/netbox-docker-agent/assets/17571692/06f81159-1830-45d2-9cd0-b4a949ab086e)


## Settings

Go to the [nodered admin page](http://localhost:1880/nodered) to change the settings.
You can define username and password via envionment variable:
- API_USERNAME 
- API_PASSWORD (NOTE: password should be a hash of node-red admin hash-pw)
- ADMIN_USERNAME
- ADMIN_PASSWORD (NOTE: password should be a hash of node-red admin hash-pw)

You can disable node-red editor by setting ENABLE_EDITOR to any value.

You can disable docker exec command by settings DISABLE_EXEC to any value.

## Clean
```
docker stop netbox-docker-agent
docker rm netbox-docker-agent
docker image rm saashup/netbox-docker-agent
docker volume rm netbox-docker-agent
```
## Build
```
docker build -t saashup/netbox-docker-agent .
```
## Run
```
docker run -d -p 1880:1880 -v /var/run/docker.sock:/var/run/docker.sock:rw -v netbox-docker-agent:/data --name netbox-docker-agent saashup/netbox-docker-agent
```
container must have **rw access to the docker unix socket** (/var/run/docker.sock)

Default access is *admin/saashup*

## Contribute

### Run locally

On the root of the project run:

```
npm install
DATAPATH=. npx node-red -u . -s settings_dev.js
```

### Run tests locally

On the root of the project run and the project running locally:

```
Docker:
cat ./netbox-docker-agent/tests/hurl/tests.hurl | docker run --rm --network netbox-docker-agent -i ghcr.io/orange-opensource/hurl:latest --test --color --variable host=http://netbox-docker-agent:1880 -u admin:saashup


NPM:
npm install --include=dev
npm run test
```

Then you can browse http://localhost:1880/nodered. Default access is *admin/saashup*.

## Connect

log into [ui page](http://localhost:1880) to see your docker assets

![Screenshot from 2024-01-30 18-40-14](https://github.com/SaaShup/netbox-docker-agent/assets/17571692/2437410b-734d-4601-bbd1-745041e08529)

## Monitoring
The application has a '/metrics' endpoint which can be used with prometheus to monitor if the access on the docker daemon socket is working and if all the containers are up and running.

The following metrics are currently exposed:

```
# HELP netbox_docker_agent_container_running Show if a container is running
# TYPE netbox_docker_agent_container_running gauge
netbox_docker_agent_container_running{name="example-running", state="running", status="Up 5 seconds (health: starting)"} 1

# HELP netbox_docker_agent_container_exited Show if a container is exited
# TYPE netbox_docker_agent_container_exited gauge
netbox_docker_agent_container_exited{name="example-exited", state="exited", status="Exited (130) 6 months ago"} 1

# HELP netbox_docker_agent_container_stopped Show if a container is exited
# TYPE netbox_docker_agent_container_stopped gauge
netbox_docker_agent_container_stopped{name="example-stopped", state="stopped", status="Stopped"} 1

# HELP netbox_docker_agent_docker_daemon Show if the connection to the daemon is working
# TYPE netbox_docker_agent_docker_daemon gauge
netbox_docker_agent_docker_daemon{socket="/var/run/docker.socket"} 1

# HELP netbox_docker_agent_netbox_error_response Show the netbox error response counter
# TYPE netbox_docker_agent_netbox_error_response counter
netbox_docker_agent_netbox_error_response{} 0
```

Example of prometheus configuration:

```
  - job_name: 'netbox-docker-agent'

    # Override the global default and scrape targets from this job every 5 seconds.
    scrape_interval: 5s

    static_configs:
      - targets: ['IP_ADDRESS:1880']
    metrics_path: "/metrics"
    basic_auth:
      username: 'admin'
      password: 'saashup'
```

## Logs
Currently all logs are send to stdout, if netbox send an error message to the agent.

The format of the error message is the following one:
```
${data.name} level=${level[lvl]} version=${data.version} msg=${JSON.stringify(msg.msg)}
```

This can be changed by updating inside the INIT flow the "settings.js template" and change the logging.console.handler .

# Hosting
Check https://saashup.com for more information
