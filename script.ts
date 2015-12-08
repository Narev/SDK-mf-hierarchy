/// <reference path='./typings/tsd.d.ts' />
/// <reference path="./typings/node/node.d.ts" />
/// <reference path="./FileWriter.ts"/>

import { MendixSdkClient, OnlineWorkingCopy, Project, Revision, Branch } from "mendixplatformsdk";
import { ModelSdkClient, IModel, projects, domainmodels, microflows, pages, navigation, texts } from "mendixmodelsdk";

import when = require("when");
import fs = require("fs");
import fw = require("./FileWriter");


//const readlineSync = require('readline-sync');

/*
* CREDENTIALS
*/

var username = "jasper.van.der.hoek@mendix.com";
var apikey = "b5085ff6-6b57-45a2-8060-49b5c0e651f5";
// var projectId = "acf09205-006a-499b-a1a3-4b3a1dc543af";
// var projectName = "HR-US";
// var branchName = "SDK-Test"; // null for mainline
// var revNo = -1; // -1 for latest

var projectId = "38ef5403-a28e-470f-8761-aef7f15d876d";
var projectName = "BDC - CLS";
var branchName = "branch-ArchitectureReview-Mx-Jasper"; // null for mainline
var revNo = -1; // -1 for latest


var mfNameList:Array<string> = []; //["HR.MB_SaveAndSubmitAbsenceRequest", "HR.MB_SaveAndSubmitAbsenceRequest"];

const client = new MendixSdkClient(username, apikey);

var fileLocation = "./mfHierarchy.txt";
var fW =  new fw.FileWriter(fileLocation);
fW.appendHeader( "depth,currentMf,sequence,type,action,callsMf");

/*
* PROJECT TO ANALYZE
*/
var evaluatedMFs = {};
const project = new Project(client, projectId, projectName);

client.platform().createOnlineWorkingCopy(project, new Revision(revNo, new Branch(project, branchName)))
.then(workingCopy => workingCopy.model().allMicroflows() )
.then(microflows => loadAllMicroflows(microflows).done(microflows => checkHierarchy(microflows) ) )
.then(
  () => {
    console.log("Done.");
  },
  error => {
    console.log("Something went wrong:");
    console.dir(error);
  });

  function checkHierarchy(microflowList: microflows.Microflow[]) {
    microflowList.forEach((flow) => {
      if ( mfNameList.length == 0 || mfNameList.indexOf(flow.qualifiedName) >= 0 ) {
        checkSingleFlow( flow, null, null, 0 );
      }
    });
  } //END - checkHierarchy


  function checkSingleFlow( microflow: microflows.Microflow, parentReference:string, parentMfObject:microflows.MicroflowObject, depth:number ) {
    logIndent( depth, parentMfObject, "[MF] " + microflow.qualifiedName );

    if( microflow.id in evaluatedMFs ) {
      console.log( "Skipping, already checked: " + microflow.qualifiedName );
      return;
    }

    var flows: { [originid: string]: microflows.SequenceFlow[] } = {};

    microflow.flows.forEach(f => {
      if (f instanceof microflows.SequenceFlow) {
        if (!(f.origin.id in flows)) {
          flows[f.origin.id] = [];
        }
        flows[f.origin.id].push(f);
      }
    });

    var startEvent: microflows.StartEvent = microflow.objectCollection.objects.filter(o => o instanceof microflows.StartEvent)[0];
    //Track all microflow objects that have been visited so we don't end up in infinite loops
    var visited = {};

    try {
      followPath(startEvent, depth, 1);
    } catch (e) {
      console.log("Error occured while following the path..." + e);
    }

    // resolve(true);

    /* Evaluate all mfObjects that are down this path */
    function followPath(currentEvent: microflows.MicroflowObject, depth: number, sequence:number) {
      if (currentEvent.id in visited) {
        // console.log("WARNING, BEEN HERE BEFORE " + currentEvent.typeName);
        return;
      }
      // console.log("Checking event " + currentEvent.typeName);
      visited[currentEvent.id] = true;

      evaluateOutput(depth, sequence, microflow, currentEvent, parentReference, parentMfObject );

      if ( (currentEvent.id in flows) ) {
        if (flows[currentEvent.id].length == 1) {
          followPath( flows[currentEvent.id][0].destination, depth, sequence+1);
        }
        else {
          //now we need to check each destination
          flows[currentEvent.id].forEach(flowLine => {
            followPath( flowLine.destination, depth, sequence+1);
          });
        }
      }



    } //END- followPath

  } //END- checkSingleFlow

  function evaluateOutput(depth:number, sequence:number, microflow:microflows.Microflow, currentEvent:microflows.MicroflowObject, parentReference:string, parentMfObject:microflows.MicroflowObject  ) {
    if (currentEvent instanceof microflows.ActionActivity) {
      var actionCall = (<microflows.ActionActivity>currentEvent).action;

      var caption = currentEvent.caption;
      if (currentEvent.autoGenerateCaption ) {
        caption = null;
      }

      if (actionCall instanceof microflows.AppServiceCallAction) {
        console.log( actionCall.toPlainJson() );
        logIndent(depth, parentMfObject, "Call AppService: " + actionCall.appServiceActionQualifiedName );
        writeToFile( depth, sequence, microflow, "appservice", actionCall.appServiceActionQualifiedName, actionCall.appServiceAction.container.moduleName, actionCall.appServiceAction.container.name + "/" + actionCall.appServiceAction.name );

      }
      else if (actionCall instanceof microflows.WebServiceCallAction) {
        logIndent(depth, parentMfObject, "Call WebService: " + actionCall.serviceName + "/" + actionCall.operationName );
        writeToFile( depth, sequence, microflow, "webservice", actionCall.serviceName + "/" + actionCall.operationName, actionCall.importedWebService.moduleName, actionCall.importedWebService.qualifiedName + "/" + actionCall.operationName );

      }
      else if ( actionCall instanceof microflows.JavaActionCallAction) {
        logIndent( depth, parentMfObject, "[JAVA] " + actionCall.javaActionQualifiedName );
        writeToFile( depth, sequence, microflow, "java", (caption ==null? actionCall.javaActionQualifiedName:caption), actionCall.javaAction.moduleName, actionCall.javaAction.name );

      }
      else if ( actionCall instanceof microflows.MicroflowCallAction ) {
        logIndent( depth, parentMfObject, "[MF] " + actionCall.microflowCall.microflowQualifiedName );
        writeToFile( depth, sequence, microflow, "microflow", (caption ==null ? actionCall.microflowCall.microflowQualifiedName :caption), actionCall.microflowCall.microflow.moduleName, actionCall.microflowCall.microflow.name );
        // var loadedFlow = loadMicroflow( actionCall.microflowCall.microflow );
        checkSingleFlow((<microflows.Microflow>actionCall.microflowCall.microflow), microflow.qualifiedName, parentMfObject, 1+depth);

      }
    }

  } //END- evaluateOutput

  function logIndent(indent: number, parentMfObject:microflows.MicroflowObject, message: string) {
    // console.log("        " + indent + "||" + ( parentMfObject != null ? parentMfObject.qualifiedName : "    " ) + "|" + Array(indent + 1).join(" ") + message);
  }

  function writeToFile(indent: number, sequence:number, currentMf:microflows.Microflow, type:string, actionName:string, callsActionModule:string, callsActionName:string ) {
    var msg = indent + "," + (currentMf!=null? currentMf.moduleName :"") + "," + (currentMf!=null? currentMf.name :"") + "," + sequence + "," +  type + "," + actionName + "," + callsActionModule + "," + callsActionName;

        console.log(msg);
        fW.appendLine( msg );
  }


  function loadAllMicroflows(microflows: microflows.IMicroflow[]): when.Promise<microflows.Microflow[]> {
    return when.all<microflows.Microflow[]>(microflows.map(loadMicroflow));
  }

  function loadMicroflow(microflow: microflows.IMicroflow): when.Promise<microflows.Microflow> {
    return when.promise<microflows.Microflow>((resolve, reject) => {
      if (microflow) {
        console.log(`Loading microflow: ${microflow.qualifiedName}`);
        microflow.load(mf => {
          if (mf) {
            console.log(`Loaded microflow: ${microflow.qualifiedName}`);
            resolve(mf);
          } else {
            console.log(`Failed to load microflow: ${microflow.qualifiedName}`);
            reject(`Failed to load microflow: ${microflow.qualifiedName}`);
          }
        });
      } else {
        reject(`'microflow' is undefined`);
      }
    });
  }
