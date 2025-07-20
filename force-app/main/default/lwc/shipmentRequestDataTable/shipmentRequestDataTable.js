import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { updateRecord } from 'lightning/uiRecordApi'; 
import getShipmentRequests from '@salesforce/apex/ShipmentRequestController.getShipmentRequests';
import { subscribe, unsubscribe, onError } from 'lightning/empApi';
import { refreshApex } from '@salesforce/apex';

const COLUMNS = [
    { label: 'Name', fieldName: 'Name' },
    { label: 'Status', fieldName: 'Status__c' },
    { label: 'Destination', fieldName: 'Destination__c' },
    { label: 'Estimated Delivery', fieldName: 'Estimated_Delivety__c'},
    { label: 'Assigned Agent', fieldName: 'assginedAgent' },
    {
        type: 'action',
        typeAttributes: {
            rowActions: [
                { label: 'View', name: 'view' },
                { label: 'Edit', name: 'edit' }
            ]
        }
    }
];

export default class ShipmentRequestDataTable extends NavigationMixin(LightningElement) {
    columns = COLUMNS;
    shipments;

    _wiredShipmentsResult;
    subscription = {};
    channelName = '/data/ShipmentRequest__ChangeEvent';

    @wire(getShipmentRequests)
    wiredShipments(result) {
        console.log("result");
        console.log(result);
        this._wiredShipmentsResult = result;
        const {data, error} = result;

        if (data) {
            console.log(data);
            this.shipments = data.map((shipment) => ({
                ...shipment,
                assginedAgent: shipment.Owner__r?.Name,
                recordLink: `/${shipment.Id}`
            }));
        } else if (error) {
            console.error('Error fetching shipment requests:', error);
        }
    }

    connectedCallback() {
        this.handleSubscribe();
        this.registerErrorListener();
    }

    disconnectedCallback() {
        this.handleUnsubscribe();
    }

    handleSubscribe() {
        const messageCallback = (response) => {
            console.log('Received CDC Event:', JSON.stringify(response));
            const payload = response.data.payload;
            const changedRecordIds = payload.ChangeEventHeader.recordIds;
            const changeType = payload.ChangeEventHeader.changeType;

            if (this.shipments && changedRecordIds.some(id => this.shipments.some(s => s.Id === id))) {
                refreshApex(this._wiredShipmentsResult);
            } else if (changeType === 'CREATE' && this.shipments) {
                refreshApex(this._wiredShipmentsResult);
            }
        };

        subscribe(this.channelName, -1, messageCallback).then((subscription) => {
            this.subscription = subscription;
        }).catch(error => {
            console.error('Error subscribing to CDC channel:', error);
        });
    }

    handleUnsubscribe() {
        unsubscribe(this.subscription, response => {
            console.log('Successfully unsubscribed:', JSON.stringify(response));
        });
    }

    registerErrorListener() {
        onError(error => {
            console.error('Received error from streaming API:', JSON.stringify(error));
        });
    }

    async handleRowAction(event) {
        const { action, row } = event.detail;
        const actionName = action.name;
        const recordId = row.Id;
        const currentStatus = row.Status__c;

        if (actionName === 'view' && currentStatus === 'Assigned to Agent') {
            const fields = {};
            fields['Id'] = recordId;
            fields['Status__c'] = 'In Review';

            const recordInput = { fields };

            try {
                await updateRecord(recordInput);

                refreshApex(this._wiredShipmentsResult);

            } catch (error) {
                console.error('Error updating shipment status:', error);
            }
        }

        const pageRef = {
                type: 'standard__recordPage',
                attributes: {
                    recordId: recordId,
                    objectApiName: 'ShipmentRequest__c',
                    actionName: 'edit'
                }
            };
        this[NavigationMixin.Navigate](pageRef);
    }

    async handleSave(event) {
        const records = event.detail.draftValues.map(draft => {
            const fields = { ...draft };
            return { fields };
        });

        try {
            await Promise.all(records.map(record => updateRecord(record)));

            this.template.querySelector('lightning-datatable').draftValues = [];

            return refreshApex(this.wiredShipments);
        } catch (err) {
            console.error('Update failed', err);
        }
    }

}
