#!/bin/sh
if [ -z "${AUTHORIZED_KEYS}" ]; then
  echo "Need your ssh public key as AUTHORIZED_KEYS env variable. Abnormal exit ..."
  exit 1
fi

echo "Populating /root/.ssh/authorized_keys with the value from AUTHORIZED_KEYS env variable ..."
echo "${AUTHORIZED_KEYS}" >/root/.ssh/authorized_keys

echo "root:root" | chpasswd

# Edit SSHD Configuration
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/g' /etc/ssh/sshd_config
sed -i 's/AllowTcpForwarding no/AllowTcpForwarding yes/g' /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin without-password/g' /etc/ssh/sshd_config
cat /etc/ssh/sshd_config
service sshd restart

# Execute the CMD from the Dockerfile:
exec "$@"