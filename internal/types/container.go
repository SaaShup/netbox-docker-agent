package types

type ContainerSpec struct {
	ContainerID string `json:"container_id"`

	Name     string `json:"name"`
	Hostname string `json:"hostname"`
	Image    string `json:"image"`

	EnvVars map[string]string `json:"env_vars"`
	Labels  map[string]string `json:"labels"`

	Ports []struct {
		HostPort      int16  `json:"host_port"`
		ContainerPort int16  `json:"container_port"`
		Type          string `json:"type"`
	} `json:"ports"`

	Volumes []struct {
		Name          string `json:"name"`
		ContainerPath string `json:"container_path"`
	} `json:"volumes"`

	Binds []struct {
		HostPath      string `json:"host_path"`
		ContainerPath string `json:"container_path"`
	} `json:"binds"`
}
