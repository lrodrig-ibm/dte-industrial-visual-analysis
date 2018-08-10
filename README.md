**__Skill Level__**: Beginner
<br>**__N.B__**: All services used in this repo are Lite plans.

See working DTE Asset Demo [here](http://industrial-visual-analysis-dte.mybluemix.net)

# Industrial Visual Analysis

In this code pattern, we will identify industrial equipment for various damages upon visual inspection by using machine learning classification techniques.  Using Watson Visual Recognition, we will analyze the image against a trained classifier to inspect oil and gas pipelines with six identifiers - Normal, Burst, Corrosion, Damaged Coating, Joint Failure and Leak. For each image we will provide a percent match with each of the categories on how closely the image matches one of the damaged identifiers or the Normal identifier.  This data can then be used to create a dashboard to the pipelines needing immediate attention to no attention.

The image data is stored in a Cloudant database which makes it easier to connect remote devices (including drones) to capture images. The database can store different properties of the images like location and description.  This code pattern demonstrates a NodeJS application that is notified when an image is added to the Cloudant database. The application performs the Visual Recognition analysis and updates the Cloudant database with the analysis data.

When the reader has completed this code pattern, they will understand how to:

* Train Visual Recognition to classify images
* Configure Cloudant database to store and retrieve image data
* Launch a NodeJS web app to view a dashboard of the Visual Recognition analysis, and deploy to IBM Cloud

# Architecture Flow

<p align="center">
  <img width="600"  src="readme_images\arch_flow.png">
</p>

1. User uploads the image through the web UI
2. The image data is sent to the Cloudant database
3. The web application analyzes the image using the trained Watson Visual Recognition service
4. The analyzed data is fed back into the Cloudant database
5. The dashboard on the web UI displays the Visual Recognition analysis and images requiring attention


## Included Components
+ [Visual Recognition](https://www.ibm.com/watson/services/visual-recognition/)
+ [Cloudant](https://www.ibm.com/analytics/us/en/technology/cloud-data-services/cloudant/)
+ [Node JS Application](https://console.bluemix.net/docs/runtimes/nodejs/index.html#nodejs_runtime)


# Running the Application
Follow these steps to setup and run the application. The steps are described in detail below.

## Steps
1. [Watson Visual Recognition Setup](#1-Watson-Visual-Recognition-Setup)
2. [Cloudant NoSQL DB Setup](#2-Cloudant-NoSQL-DB-Setup)
3. [Run Web Application](#4-Run-Web-Application)

## 1. Watson Visual Recognition Setup

#### Clone this repository
You will need to clone this repository so you can leverage the training image data for your custom model, modify the project to add your service credentials and run the web application.

* Open a command line interface (CLI) on your desktop and clone this repo (you can install Git [here](https://git-scm.com/downloads)): 
```
git clone https://github.com/lrodrig-ibm/dte-industrial-visual-analysis
```

Create the [Watson Visual Recognition](https://www.ibm.com/watson/services/visual-recognition/) service in IBM Cloud. You will be able to find the service in the IBM Cloud Catalog under AI.

<p align="center">
<img width="800"  src="readme_images\vr_ibmcloudcatalog.png">
</p>

When the Visual Recognition service is provisioned, it will provide you with a screen that shows your service credentials. 
You will need to copy the ``API Key`` to use it later.

<p align="center">
<img width="800"  src="readme_images\vr_apikey.png">
</p>

As shown above, there will also be a ``Launch Tool`` button that will launch Watson Studio where you will be able to train your own custom Visual Recognition model. 
Click the Launch tool button.

Watson Studio will show you the current models built into the Watson Visual Recognition service such as the General model, Face mode, etc.
Select the ``Create Model`` button to create your own custom visual recognition model.

<p align="center">
<img width="800"  src="readme_images\ws-createmodel.png">
</p>

A project will be created for your custom model.
Use ``Industrial Visual Analysis Custom Model`` as your project name.

<p align="center">
<img width="800"  src="readme_images\ws-newproject.png">
</p>

Scroll down to the ``Define Watson Visual Recognition`` and associate your existing Visual Recognition service to this project.

<p align="center">
<img width="800"  src="readme_images\ws-newproject-vr.png">
</p>

Select ``Create``

Optional Step: The custom model will have a default name of ``Default Custom Model`` . You can choose to name your model something else by selecting the pencil icon next to the model name and using a model name such as Oil Pipeline Model. 

To train your custom model, you will need to upload the training data that is part of this github repository. Select the ``Browse``button on the right and select the 6 zip files containing the training image data which is found in this github repo under ``vr-image-training-data``.  
After the zip files have been uploaded, select all the zip files and then click on  ``Add to Model `` to add the files to the model that will be training.

<p align="center">
<img width="800"  src="readme_images\ws-adddatasets.png">
</p>

When the models have been added, select   ``Train Model ``.

<p align="center">
<img width="800"  src="readme_images\ws-starttraining.png">
</p>

You will see a message that says:
```
Model training started. You will not be able to make changes while this is in progress. We'll notify you once training is complete.
```

When the training has completed, you will see a message that says:
```
Your model training was successful. Click here to view and test your model.
```
Click on the ``here`` link provided in the message.

<p align="center">
<img width="800"  src="readme_images\ws-trainingcomplete.png">
</p>

You will now be able to see the details on your custom model. 
You will see a ``Model ID`` for your model.
SAVE THIS FOR FUTURE STEPS!

<p align="center">
<img width="800"  src="readme_images\ws-viewcustommodel.png">
</p>

You can test your model directly from Watson Studio by selecting the ``Test``  tab. You will then be able to browse your local files and submit an image to be classified. 
Select a sample image provided in this github repo in the ``vr-image-test-data``  folder.

<p align="center">
<img width="800"  src="readme_images\ws-testmodel.png">
</p>

You can find more information on working with your classifier [here](https://console.bluemix.net/docs/services/visual-recognition/tutorial-custom-classifier.html#creating-a-custom-classifier)

Now that you have confirmed the custom model is working as expected, you are ready for the next step.

## 2. Cloudant NoSQL DB Setup

Create the [Cloudant NoSQL](https://www.ibm.com/analytics/us/en/technology/cloud-data-services/cloudant/) service in IBM Cloud. You will find the service in the IBM Cloud Catalog under Databases

After the service is provisioned, you will see a ``Launch Cloudant Dashboard`` button that will take you to your Cloudant service.

Create a new database in Cloudant called <strong>image_db</strong>

<p align="center">
  <img width="600"  src="readme_images\cloudant_db.png">
</p>


Next, create a view on the database with the design name ``image_db_images``, index name ``image_db.images``, and use the following map function:
```
function (doc) {
if ( doc.type == 'image_db.image' ) {
  emit(doc);
}
}
```
<p align="center">
<img width="600"  src="readme_images\cloudant_view.png">
</p>

<p align="center">
  <img width="600"  src="readme_images\cloudant_setupview.png">
</p>

You're now ready to run the web application in the next step.

## 3. Run Web Application

#### Configure .env file

You will need to provide credentials to your Cloudant NoSQL database and Watson Visual Recognition service information retrieved in the previous steps, into a `.env file`. Copy the sample `.env.example` file using the following command:

```
cp .env.example .env
```

and fill in your credentials and your VR Classifier name.

```
#From cloudant NoSQL database
CLOUDANT_USERNAME=
CLOUDANT_PASSWORD=
CLOUDANT_HOST=
CLOUDANT_URL=
CLOUDANT_DB=image_db
#From Watson Visual Recognition Service
VR_KEY=
VR_URL=
VR_CLASSIFIERS=OilPipeCondition_106369316 (REPLACE WITH YOUR CUSTOM MODEL ID NAME)

```

#### Run locally

To run the app, go to the ```Industrial-Visual-Analysis``` folder and run the following commands.

* Install node js through the link [here](https://nodejs.org/en/download/)

* Install the dependencies your application need:

```
npm install
```

* Start the application locally:

```
npm start
```

Test your application by going to: [http://localhost:3000/](http://localhost:3000/)

Now that you have a working local web application, let's push the app to the IBM Cloud!

#### Deploy to IBM Cloud

[![Deploy to IBM Cloud](https://bluemix.net/deploy/button.png)](https://github.com/lrodrig-ibm/dte-industrial-visual-analysis)

You can push the app to IBM Cloud by first editing the ```manifest file``` file and then using cloud foundry cli commands.

Edit the `manifest.yml` file in the folder that contains your code and replace with a unique name for your application. The name that you specify determines the application's URL, such as `your-application-name.mybluemix.net`. Additionally - update the service names so they match what you have in IBM Cloud. The relevant portion of the `manifest.yml` file looks like the following:

```
applications:
- path: .
  memory: 256M
  instances: 1
  domain: mybluemix.net
  name: {industrial-visual-analysis}
  disk_quota: 1024M
  services:
  - {cloudant}
  - {visual-recognition}
  
  
  declared-services:
  my-cloudant-service:
  label: cloudantNoSQLDB
  plan: Lite
  my-visual-recognition-service:
  label: watson_vision_combined
  plan: free
  applications:
  - path: .
  memory: 256M
  instances: 1
  domain: mybluemix.net
  name: {your-industrial-visual-analysis-app-name}
  disk_quota: 1024M
  services:
  - my-cloudant-service
  - my-visual-recognition-service
```

You will need to download the IBM Cloud Command Line Interface (CLI) to push your local app to the cloud. 
You can download the CLI [here](https://console.bluemix.net/docs/cli/reference/bluemix_cli/get_started.html)

In the command line, make sure you are in the ```Industrial-Visual-Analysis```  folder.

First login to your IBM Cloud with the following command:
```
ibmcloud login
```
Next, set your target environment where the application will be deployed to (you might only have 1 taget option called dev, choose that)
```
ibmcloud target --cf
```

Once logged in, use the following command to push the application to IBM Cloud:
```
ibmcloud app push YOUR_APP_NAME
```

#### Application

<p align="center">
  <img width="800"  src="readme_images\dashboard_screenshot.png">
</p>


The app has the following functions:
* The homepage displays a quick dashboard showing the number of images in the Cloudant database and how many of them have Watson VR analysis completed. It will also provide a count of how many images were deemed as "Needing attention" based on the response the Watson service provided when classifying the images.

* You have the ability to see all the images in one single page.

* Click on each image to pull up a detailed page providing information on one single event (image). You will be able to see information on what the Watson Visual Recognition service saw in the image and the confidence levels.  You can continue to train the service by using the thumbs up and thumbs down next to each percent match.

* You can click the ``Upload New Image`` button to send images to the Cloudant database.  There are sample images in the ``sample-images`` folder to try out.

## Troubleshooting

#### IBM Cloud application
To troubleshoot your IBM Cloud application, use the logs. To see the logs, run:

```bash
ibmcloud app logs <application-name> --recent
```

## <h2>Learn more</h2>
<ul>
<li><strong>Artificial Intelligence Code Patterns</strong>: Enjoyed this Code Pattern? Check out our other <a href="https://developer.ibm.com/code/technologies/artificial-intelligence/" rel="nofollow">AI Code Patterns</a>.</li>
<li><strong>Data Analytics Code Patterns</strong>: Enjoyed this Code Pattern? Check out our other <a href="https://developer.ibm.com/code/technologies/data-science/" rel="nofollow">Data Analytics Code Patterns</a></li>
<li><strong>AI and Data Code Pattern Playlist</strong>: Bookmark our <a href="https://www.youtube.com/playlist?list=PLzUbsvIyrNfknNewObx5N7uGZ5FKH0Fde" rel="nofollow">playlist</a> with all of our Code Pattern videos</li>
<li><strong>With Watson</strong>: Want to take your Watson app to the next level? Looking to utilize Watson Brand assets? <a href="https://www.ibm.com/watson/with-watson/" rel="nofollow">Join the With Watson program</a> to leverage exclusive brand, marketing, and tech resources to amplify and accelerate your Watson embedded commercial solution.</li>
<li><strong>Watson Studios</strong>: Master the art of data science with IBM's <a href="https://datascience.ibm.com/" rel="nofollow">Watson Studios</a></li>
<li><strong>PowerAI</strong>: Get started or get scaling, faster, with a software distribution for machine learning running on the Enterprise Platform for AI: <a href="https://www.ibm.com/ms-en/marketplace/deep-learning-platform" rel="nofollow">IBM Power Systems</a></li>



# License

[Apache 2.0](LICENSE)
# industrial-visual-analysis-dte
