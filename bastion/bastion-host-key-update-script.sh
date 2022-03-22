#!/bin/bash

## First make sure any files we need are here so we don't have problems later
echo "Start up..."
if [[ ! -f ~/connected_ips ]]; then
    echo "connected_ips does not exist on your filesystem."
    echo "" >~/connected_ips
fi

## Get Queue Url
CONNECTION_STATUS_QUEUE_URL_RESULT=$(aws ssm get-parameter --name /stratoshell/sqs/connection_status_queue_url --region us-east-2)
QUEUE_URL=$(echo $CONNECTION_STATUS_QUEUE_URL_RESULT | jq '.Parameter' | jq '.Value' | sed 's/"//g')

## Get details from parameter store and write static files
echo "Refreshing keys..."
REGION=$(curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | grep region | awk -F\" '{print $4}')
ACTIVE_KEYS_RESULT=$(aws ssm get-parameters-by-path --path /activecommands --region $REGION --with-decryption)
echo $ACTIVE_KEYS_RESULT | jq '.Parameters' | jq '.[].Value' | sed 's/"//g' | sed 's/\\/"/g' | sed 's/"""//g' | jq '.command' | sed 's/"//g' | sed 's/exit/"exit"/g' >/home/ssh-user/.ssh/authorized_keys
echo "Refreshed keys!"

echo "Updating active request IDs"
echo $ACTIVE_KEYS_RESULT | jq '.Parameters' | jq '.[].Name' | sed 's/\/activecommands\///g' | sed 's/"//g' >~/active_requests

echo "Updating active IPs"
echo $ACTIVE_KEYS_RESULT | jq '.Parameters' | jq '.[].Value' | sed 's/"//g' | sed 's/\\/"/g' | sed 's/"""//g' | jq '.ip' | sed 's/"//g' >~/active_ips

## Find connected sessions
echo "Finding session changes"
echo "" >~/connected_ips_next
ss -t state established | awk '{print $4}' | grep :ssh | while read line; do
    echo $line | sed -e 's/:ssh//' >>~/connected_ips_next
done
sed -i '1d' ~/connected_ips_next

## start updating connections and disconnections
echo "" >~/connections
echo "" >~/disconnections

cat ~/connected_ips_next | while read line; do
    if ! grep -q $line ~/connected_ips; then
        echo $line >>~/connections
    fi
done
sed -i '1d' ~/connections

cat ~/connected_ips | while read line; do
    if ! grep -q $line ~/connected_ips_next; then
        echo $line >>~/disconnections
    fi
done
sed -i '1d' ~/disconnections

# Updated connected ips
cat connected_ips_next >connected_ips
echo "Finished updating connection records and creating IP change list"

if [[ $(wc -l <~/disconnections) -ge 0 ]] || [[ $(wc -l <~/connections) -ge 0 ]]; then

    echo "Building changelog"
    echo "connections" >changelog

    cat ~/connections | while read line; do
        if [ -n "$line" ]; then
            row=$(grep -n $line ~/active_ips | cut -d : -f 1)
            REQUEST=$(sed -n "${row}p" <active_requests)

            if [ -n "$REQUEST" ]; then
                aws sqs send-message \
                    --queue-url "$QUEUE_URL" \
                    --message-body '{"requestId": "'"$REQUEST"'"}' \
                    --message-attributes '{"Type": { "DataType": "String", "StringValue":"CONNECT"}}' \
                    --region "$REGION"
            fi
        fi

    done

    echo "disconnections" >>changelog
    cat ~/disconnections | while read line; do
        if [ -n "$line" ]; then
            row=$(grep -n $line ~/active_ips | cut -d : -f 1)
            REQUEST=$(sed -n "${row}p" <active_requests)

            if [ -n "$REQUEST" ]; then
                aws sqs send-message \
                    --queue-url "$QUEUE_URL" \
                    --message-body '{"requestId": "'"$REQUEST"'"}' \
                    --message-attributes '{"Type": { "DataType": "String", "StringValue":"DISCONNECT"}}' \
                    --region "$REGION"
            fi
        fi
    done

    echo "Build changelog"

fi
