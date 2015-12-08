/// <reference path='./typings/tsd.d.ts' />
/// <reference path="./typings/node/node.d.ts" />

import { MendixSdkClient, OnlineWorkingCopy, Project, Revision, Branch } from "mendixplatformsdk";
import { ModelSdkClient, IModel, projects, domainmodels, microflows, pages, navigation, texts } from "mendixmodelsdk";

import when = require("when");
import fs = require("fs");

//const readlineSync = require('readline-sync');

/*
* CREDENTIALS
*/

const username = "jasper.van.der.hoek@mendix.com";
const apikey = "b5085ff6-6b57-45a2-8060-49b5c0e651f5";
const projectId = "acf09205-006a-499b-a1a3-4b3a1dc543af";
const projectName = "HR-US";
const revNo = -1; // -1 for latest
const branchName = "SDK-Test"; // null for mainline

var mfNameList:Array<string> = ["HR.MB_SaveAndSubmitAbsenceRequest", "HR.MB_SaveAndSubmitAbsenceRequest"];

const client = new MendixSdkClient(username, apikey);

var fileLocation = "./output.txt";
var stream = fs.createWriteStream(fileLocation);

/*
* PROJECT TO ANALYZE
*/
const project = new Project(client, projectId, projectName);

client.platform().createOnlineWorkingCopy(project, new Revision(revNo, new Branch(project, branchName)))
.then(workingCopy => workingCopy.model().allMicroflows().filter(mf => (mfNameList.indexOf(mf.qualifiedName) >= 0 )) )
.then(microflows => loadAllMicroflows(microflows)
                      .done( microflows => checkHierarchy(microflows) ) )

.done(
  () => {
    console.log("Done.");
  },
  error => {
    console.log("Something went wrong:");
    console.dir(error);
  });



  function checkHierarchy(microflowList: microflows.Microflow[]) {
    var evaluatedMFs = {};

    microflowList.forEach((flow) => {
      checkSingleFlow( flow, null, null, 0 );
    });

    function checkSingleFlow( microflow: microflows.Microflow, parentReference:string, parentMfObject:microflows.MicroflowObject, depth:number ): when.Promise<Boolean> { //}: when.Promise<Boolean> {
      return when.promise<Boolean>((resolve, reject) => {
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
        // var subFlowsToEvaluate:microflows.Microflow[] = [];

        try {
          followPath(startEvent, depth)
          .done( subFlows => {
            console.log( "mainFollowPathResult " + subFlows.length);
            // subFlows.forEach( flow => { checkSingleFlow(flow, microflow.qualifiedName, null, depth+1 ); });
          } );
        } catch (e) {
          console.log("Error occured while following the path..." + e);
        }

        // resolve(true);

        /* Evaluate all mfObjects that are down this path */
        function followPath(currentEvent: microflows.MicroflowObject, depth: number, breakOnMerges = true) : when.Promise<microflows.Microflow[]> {
          return when.promise<microflows.Microflow[]>((resolve, reject) => {
            if (currentEvent.id in visited) {
              // console.log("WARNING, BEEN HERE BEFORE " + currentEvent.typeName);
              return;
            }
            // console.log("Checking event " + currentEvent.typeName);
            visited[currentEvent.id] = true;


            evaluateOutput(depth, currentEvent)
            .done( subFlow => {
              console.log( "evaluateOutput " + subFlow);
              var subFlowList = [];
              if ( subFlow ) {
                subFlowList.push( subFlow );
              }

              if ( (currentEvent.id in flows) ) {
                if (flows[currentEvent.id].length == 1) {
                  followPath( flows[currentEvent.id][0].destination, depth)
                    .done( subFlowResult => { subFlowList.push(subFlowResult);
                      console.log( "evaluateNextPathResult " + subFlowResult.length); resolve( subFlowList ); } );
                }
                else {
                  //now we need to check each destination

                  for (var i = 0; i < flows[currentEvent.id].length; i++) {
                      var flowLine = flows[currentEvent.id][i];
                      followPath( flowLine.destination, depth)
                        .done(
                          subFlowResult => {
                            console.log( "evaluateNextPathResult " + subFlowResult.length);
                            if ( subFlowResult ) {
                              subFlowList.push( subFlowResult);
                            }
                            if ( i+1 == flows[currentEvent.id].length) {
                              resolve(subFlowList);
                            }
                          } );
                  }
                }
              }
            });

            function evaluateOutput(depth:number, currentEvent:microflows.MicroflowObject ) : when.Promise<microflows.Microflow> {
              return when.promise<microflows.Microflow>((resolve, reject) => {
                if (currentEvent instanceof microflows.ActionActivity) {
                  var actionCall = (<microflows.ActionActivity>currentEvent).action;

                  if (actionCall instanceof microflows.AppServiceCallAction) {
                    logIndent(depth, parentMfObject, "Call AppService: " + actionCall.appServiceActionQualifiedName );
                    writeToFile( depth, parentReference, microflow, "appservice", actionCall.appServiceActionQualifiedName )
                    .done( result => { resolve( null ); });
                  }
                  else if (actionCall instanceof microflows.WebServiceCallAction) {
                    logIndent(depth, parentMfObject, "Call WebService: " + actionCall.serviceName + "/" + actionCall.operationName );
                    writeToFile( depth, parentReference, microflow, "webservice", actionCall.serviceName + "/" + actionCall.operationName )
                    .done( result => { resolve( null ); });
                  }
                  else if ( actionCall instanceof microflows.JavaActionCallAction) {
                    logIndent( depth, parentMfObject, "[JAVA] " + actionCall.javaActionQualifiedName );
                    writeToFile( depth, parentReference, microflow, "java", actionCall.javaActionQualifiedName )
                    .done( result => { resolve( null ); });
                  }
                  else if ( actionCall instanceof microflows.MicroflowCallAction ) {
                    logIndent( depth, parentMfObject, "[MF] " + actionCall.microflowCall.microflowQualifiedName );
                    writeToFile( depth, parentReference, microflow, "microflow", actionCall.microflowCall.microflowQualifiedName )
                    .done( result => {
                        loadMicroflow( actionCall.microflowCall.microflow )
                        .done( loadedFlow => checkSingleFlow(loadedFlow, microflow.qualifiedName, currentEvent, depth+1).done( () => resolve(null) ) );
                      });
                  }
                  else {
                    resolve(null);
                  }
                }
              });
            } //END- evaluateOutput

          });
        } //END- followPath

      });

    } //END- checkSingleFlow
  } //END - checkHierarchy


  function logIndent(indent: number, parentMfObject:microflows.MicroflowObject, message: string) {
    // console.log("        " + indent + "||" + ( parentMfObject != null ? parentMfObject.qualifiedName : "    " ) + "|" + Array(indent + 1).join(" ") + message);
  }

  function writeToFile(indent: number, parentReference:string, currentMf:microflows.Microflow, type:string, actionName:string): when.Promise<Boolean> {
    return when.promise<Boolean>((resolve, reject) => {
      var msg = "#####" + indent +
                "|" + parentReference +
                "|" + (currentMf!=null?currentMf.qualifiedName :" " ) +
                "|Calling:" + type +
                "=" + actionName;

          console.log(msg);
          stream.write(msg + "\r\n");
          resolve( true );
          });
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
