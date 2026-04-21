package common

import (
	"fmt"
	"os"
	"runtime/pprof"
	"time"

	"github.com/shirou/gopsutil/cpu"
)

// Monitor 定时监控cpu使用率，超过阈值输出pprof文件
func Monitor() {
	enabled := GetEnvOrDefaultBool("PPROF_MONITOR_ENABLED", false)
	if !enabled {
		SysLog("pprof monitor disabled")
		return
	}
	threshold := GetEnvOrDefault("PPROF_CPU_THRESHOLD", 85)
	if threshold <= 0 {
		threshold = 85
	}
	intervalSecond := GetEnvOrDefault("PPROF_MONITOR_INTERVAL_SECONDS", 30)
	if intervalSecond <= 0 {
		intervalSecond = 30
	}
	profileDuration := GetEnvOrDefault("PPROF_MONITOR_PROFILE_SECONDS", 10)
	if profileDuration <= 0 {
		profileDuration = 10
	}
	interval := time.Duration(intervalSecond) * time.Second
	profileSleep := time.Duration(profileDuration) * time.Second

	for {
		percent, err := cpu.Percent(time.Second, false)
		if err != nil {
			SysLog("cpu.Percent failed: " + err.Error())
			time.Sleep(interval)
			continue
		}
		if percent[0] > float64(threshold) {
			fmt.Println("cpu usage too high")
			// write pprof file
			if _, err := os.Stat("./pprof"); os.IsNotExist(err) {
				err := os.Mkdir("./pprof", os.ModePerm)
				if err != nil {
					SysLog("创建pprof文件夹失败 " + err.Error())
					continue
				}
			}
			f, err := os.Create("./pprof/" + fmt.Sprintf("cpu-%s.pprof", time.Now().Format("20060102150405")))
			if err != nil {
				SysLog("创建pprof文件失败 " + err.Error())
				continue
			}
			err = pprof.StartCPUProfile(f)
			if err != nil {
				SysLog("启动pprof失败 " + err.Error())
				_ = f.Close()
				continue
			}
			time.Sleep(profileSleep)
			pprof.StopCPUProfile()
			f.Close()
		}
		time.Sleep(interval)
	}
}
