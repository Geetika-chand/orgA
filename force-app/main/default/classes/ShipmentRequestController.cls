public with sharing class ShipmentRequestController {
    @AuraEnabled(cacheable=true)
    public static List<ShipmentRequest__c> getShipmentRequests() {
        return [
            SELECT Id, Destination__c, Owner__c, Owner__r.Name, Estimated_Delivety__c, Status__c
            FROM ShipmentRequest__c
            ORDER BY CreatedDate DESC
            LIMIT 100
        ];
    }
}
